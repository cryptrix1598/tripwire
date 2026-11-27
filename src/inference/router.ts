/**
 * Tripwire's hybrid router. This module owns EVERY AI call the extension makes.
 *
 *   Signal detected (page content or risky action)
 *     │
 *     ▼
 *   [1] On-device triage ── score < LOW ──────────────► safe (silent)
 *     │                └── score ≥ HIGH + corroborated ► TRIP (local verdict)
 *     │ uncertain middle band
 *     ▼
 *   [2] Privacy gate: regex redaction → on-device redaction → regex again → leak check
 *     ▼
 *   [3] Cloud deep analysis, on REDACTED text only
 *     ▼
 *   [4] Merge verdict → UI state (safe / caution / tripped)
 *
 * When the on-device model is unavailable: skip [1] and the model half of [2],
 * run the regex redactor, then call the cloud with redacted text.
 *
 * Every verdict carries a `route` so the UI can say, truthfully, what left the
 * device. Every model response is schema-validated; invalid output is retried
 * once and then fails SAFE (caution), never silently passing.
 *
 * The router itself has no Firebase imports. It talks to an `AiEngine`, whose
 * production implementation (firebaseEngine.ts) is Firebase AI Logic.
 */
import type { z } from 'zod';
import type { TripwireConfig } from '../config/defaults';
import { redactForCloud, type ModelRedactor } from '../redaction/pipeline';
import { EXPLANATION, RULE_FLAG } from '../ui/copy';
import { PrivacyInvariantError, withTimeout, type AiEngine, type OnDeviceStatus } from './engine';
import { DEFAULT_TIMEOUTS } from './timeouts';
import {
  buildCloudPrompt,
  buildRedactPrompt,
  buildTranslatePrompt,
  buildTriagePrompt,
  explainLanguage,
  promptSet,
  type PromptContext,
} from './prompts';
import {
  CloudAnalysisSchema,
  RedactionSchema,
  TranslationSchema,
  TriageSchema,
  type CloudAnalysis,
  type Route,
  type ScamType,
  type Triage,
  type Trigger,
  type Verdict,
  type VerdictState,
} from './schemas';
import {
  ABOUT_SCAMS_AT,
  detectShape,
  directedAsks,
  salientExcerpt,
  scamTalk,
  triesToSteerTheChecker,
  worthACloudLook,
  worthALocalLook,
} from './shape';
import { describeSignals, detectSignals, worthChecking, type Signals } from './signals';

export interface AssessInput {
  /** Visible text of the page or opened email. */
  text: string;
  /** Host only, e.g. "example.com". */
  hostname: string;
  trigger: Trigger;
  /** Browser UI language (e.g. "es-ES"). When not English, the reasons are written in it. */
  language?: string;
  /**
   * Where the text came from. "call": the person typed what a caller is saying, and asked for
   * the check, so it always reaches a model. Default: a page or opened email.
   */
  source?: 'page' | 'call';
  /**
   * The person reported an ask that is never safe on an unexpected call (gift cards, crypto,
   * a code, personal details, computer access). The verdict is then never "safe".
   */
  neverSafe?: boolean;
  /** The caller has asked for nothing yet and is not pressing (see call/describe.ts): nothing to judge. */
  nothingAskedYet?: boolean;
}

export interface RouterDeps {
  /** How long to wait before retrying a cloud call that hit its quota. */
  cloudBackoffMs?: number;
  engine: AiEngine;
  config: TripwireConfig;
  now?: () => number;
  /** Per-call time limits, overridable in tests. */
  timeouts?: { onDeviceMs: number; cloudMs: number };
}


/** How much of the sent text is kept on the verdict for the "what was sent" receipt. */
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** Pull the JSON object out of a model reply, tolerating code fences and stray prose. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON object in model output');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/** Why a cloud check gave no usable answer. Recorded on the verdict, so evaluations can say why. */
export type CloudFailure = 'quota' | 'timeout' | 'network' | 'invalid' | 'gate_closed';

function isQuotaError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(text);
}

type CallResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'invalid' | 'unreachable'; timedOut?: boolean; quota?: boolean }
  // An on-device call that Chrome says was answered in the cloud. Final: never retried.
  | { ok: false; reason: 'wrong_side' };

/**
 * Run a model call, validate its output, retry once.
 * `invalid` = the model answered but never produced valid output.
 * `unreachable` = the call itself failed both times (offline, no model, timeout).
 */
async function callValidated<S extends z.ZodType>(
  call: () => Promise<string>,
  schema: S,
  backoffMs = 2_500,
): Promise<CallResult<z.output<S>>> {
  let sawAnswer = false;
  let timedOut = false;
  let quota = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await call();
    } catch (err) {
      // A call meant for the device that ran in the cloud must not be repeated.
      if (err instanceof PrivacyInvariantError) return { ok: false, reason: 'wrong_side' };
      // A timeout is not worth a second wait of the same length.
      if (err instanceof Error && err.message.includes('timed out')) {
        timedOut = true;
        break;
      }
      // Over quota (HTTP 429 / RESOURCE_EXHAUSTED): an immediate retry would fail the same way, so wait once first.
      if (isQuotaError(err)) {
        quota = true;
        if (attempt === 0) await new Promise((r) => setTimeout(r, backoffMs));
      }
      continue;
    }
    sawAnswer = true;
    try {
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return { ok: true, value: parsed.data };
    } catch {
      // fall through to retry
    }
  }
  return { ok: false, reason: sawAnswer ? 'invalid' : 'unreachable', timedOut, quota };
}

function stateFor(score: number, trigger: Trigger, config: TripwireConfig, allowTrip: boolean, call = false): VerdictState {
  const { low, high } = config.thresholds;
  if (score < low) return 'safe';
  // A described call is not an action on a page: "Hang up now" is for clear risk (or an ask that
  // is never safe, handled in finish), and "Be careful" for the middle.
  if (call) return score >= high ? 'tripped' : 'caution';
  // An action on a page that is already suspicious is the moment to step in.
  if (trigger !== 'passive') return 'tripped';
  if (score >= high && allowTrip) return 'tripped';
  return 'caution';
}

function dedupe(flags: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of flags) {
    const key = f.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

function ruleFlags(signals: Signals): string[] {
  return signals.categories.map((c) => RULE_FLAG[c]);
}

interface Draft {
  score: number;
  scamType: ScamType;
  redFlags: string[];
  explanation: string;
  confidence: number;
  route: Route;
  bytesSentToCloud?: number;
  redactionCount?: number;
  failSafe?: boolean;
  cloudUnreachable?: boolean;
  cloudFailure?: CloudFailure;
  wrongSide?: boolean;
  modelDownloading?: boolean;
  /** Passive trips need corroboration; this says whether it was present. */
  allowTrip?: boolean;
  /** Set when redFlags and explanation are written in a language other than English. */
  language?: string;
  /** The request text that went to the cloud, if any. */
  sent?: string;
}

/** What a cloud request carried when no usable answer came back. Reported like a successful one. */
type CloudAttempt = { bytesSentToCloud: number; redactionCount: number; sent: string };
const attemptOf = (cloud: { kind: string; attempt?: CloudAttempt; wrongSide?: boolean }): Partial<CloudAttempt> & { wrongSide?: boolean } =>
  cloud.kind === 'unreachable' || cloud.kind === 'invalid' ? (cloud.attempt ?? {}) : cloud.wrongSide ? { wrongSide: true } : {};

/** Stage 1: everything the router knows about the text before any model is asked. Pure. */
function readPage(input: AssessInput, config: TripwireConfig) {
  // A long page is read as its opening plus the sentences that carry an ask from the rest,
  // so a scam cannot hide below a screenful of filler.
  const half = Math.floor(config.maxScanChars / 2);
  const page =
    input.text.length <= config.maxScanChars
      ? input.text
      : `${input.text.slice(0, half)}\n${salientExcerpt(input.text.slice(half), config.maxScanChars - half)}`;
  // Advice pages, news and encyclopaedia articles ABOUT scams contain every scam phrase there is.
  const mentions = scamTalk(page);
  const signals = detectSignals(page, config);
  const asks = directedAsks(page);
  return {
    shape: detectShape(page),
    asks,
    // What the models read: a focused excerpt, never the whole of a long page.
    // Triple quotes are the prompt's own delimiter: the page must not be able to close it.
    text: salientExcerpt(page, config.maxModelChars).replace(/"{3,}/g, "'''"),
    signals,
    mentions,
    // Describing scams (third person) is not the same as using scam words while telling the reader what to do.
    aboutScams: mentions >= ABOUT_SCAMS_AT && asks < 2,
    scamWordsPlusAsks: mentions >= ABOUT_SCAMS_AT && asks >= 2,
    // Text aimed at an automated checker. A model's "safe" is never the last word on such a page.
    steering: triesToSteerTheChecker(page),
  };
}

/** Stage 2: which models may look at all. A look on the device is cheap; one that sends something is not. */
function gate(input: AssessInput, read: ReturnType<typeof readPage>) {
  const { signals, shape, asks } = read;
  const asked = input.source === 'call';
  return {
    asked,
    // Keyword lists alone were too narrow (see shape.ts), so the shape of the request counts too.
    localLook: asked || worthChecking(signals) || worthALocalLook(shape),
    // An ordinary checkout always has a price and a card number box, so when the person is
    // typing a card (or similar) those two prove nothing: only secrecy plus pressure does.
    cloudLook:
      asked ||
      worthChecking(signals) ||
      (input.trigger === 'passive' ? worthACloudLook(shape, asks) : shape.secrecy && (shape.pressure || shape.hasPhone)),
  };
}

/** The on-device redactor: the model only points at personal details; this code replaces them. */
function onDeviceRedactor(engine: AiEngine, system: string, timeoutMs: number): ModelRedactor {
  return async (preRedacted) => {
    const r = await callValidated(
      () => withTimeout(engine.redactOnDevice(system, buildRedactPrompt(preRedacted)), timeoutMs, 'on-device redaction'),
      RedactionSchema,
    );
    // Rethrown so the privacy gate closes: nothing more may be sent about this page.
    if (!r.ok && r.reason === 'wrong_side') throw new PrivacyInvariantError('on-device redaction ran in the cloud');
    if (!r.ok) return null;
    // Nothing can be paraphrased or dropped, because the model never writes the text.
    let out = preRedacted;
    for (const item of r.value.items) {
      const found = item.text.trim();
      // Ignore anything too short to be a personal detail, existing tags, and runaway answers.
      if (found.length < 3 || found.length > 80 || /^\[[A-Z]+\]$/.test(found)) continue;
      // Every occurrence, whatever its case ("Margaret" and "MARGARET"), so no variant of a listed detail is left.
      // Whole words only: a listed "Ted" must not turn "started" into "star[NAME]".
      const pattern = found.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu'), `[${item.kind}]`);
    }
    return out;
  };
}

export async function assess(input: AssessInput, deps: RouterDeps): Promise<Verdict> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { engine, config } = deps;
  const timeouts = deps.timeouts ?? DEFAULT_TIMEOUTS;
  const prompts = promptSet(config.promptVersion);
  const read = readPage(input, config);
  /** Why the cloud check, if one was tried, gave no usable answer. */
  let cloudFailure: CloudFailure | undefined;
  const { shape, text, signals, mentions, aboutScams, scamWordsPlusAsks, steering } = read;
  const language = explainLanguage(input.language);
  const ctx: PromptContext = {
    hostname: input.hostname,
    trigger: input.trigger,
    source: input.source,
    signalSummary:
      describeSignals(signals) +
      (steering ? '. Warning: the text contains instructions aimed at an automated checker, which ordinary pages never do' : '') +
      (aboutScams ? `. Note: the page says scam, scammer or victim ${mentions} times, which usually means it is explaining or warning about scams, not running one` : ''),
    ...(language ? { language } : {}),
  };

  /**
   * Put a verdict that never left the device into the reader's language, on
   * the device. If the on-device model cannot write that language, the English
   * reasons are kept: nothing is sent to the cloud just to translate.
   */
  const localise = async (d: Draft): Promise<Draft> => {
    if (!language || !engine.translateOnDevice || d.score < config.thresholds.low) return d;
    const flags = dedupe(d.redFlags);
    const texts = [d.explanation, ...flags].filter((t) => t.length > 0);
    if (texts.length === 0) return d;
    const translate = engine.translateOnDevice.bind(engine);
    const result = await callValidated(
      () => withTimeout(translate(prompts.translateSystem, buildTranslatePrompt(texts, language), language.code), timeouts.onDeviceMs, 'on-device translation'),
      TranslationSchema,
    );
    if (!result.ok && result.reason === 'wrong_side') return { ...d, wrongSide: true };
    if (!result.ok || result.value.texts.length !== texts.length) return d;
    const out = result.value.texts;
    return d.explanation
      ? { ...d, explanation: out[0] ?? d.explanation, redFlags: out.slice(1), language: language.code }
      : { ...d, redFlags: out, language: language.code };
  };

  const finish = (d: Draft): Verdict => {
    const state = stateFor(d.score, input.trigger, config, d.allowTrip ?? true, input.source === 'call');
    // Fail-safe verdicts are never allowed to read as "safe".
    const floored = steering && d.route !== 'not_checked' && state === 'safe';
    // An ask that is never safe always gets "Hang up now", whatever the score.
    const insisted = !floored && input.neverSafe === true && state !== 'tripped';
    const floorNote = floored ? EXPLANATION.steering : EXPLANATION.neverSafe;
    const finalState: VerdictState = insisted ? 'tripped' : (d.failSafe || floored) && state === 'safe' ? 'caution' : state;
    return {
      state: finalState,
      riskScore: floored || insisted ? Math.max(d.score, config.thresholds.low) : d.score,
      scamType: finalState === 'safe' ? 'none' : d.scamType === 'none' ? 'other' : d.scamType,
      redFlags: finalState === 'safe' ? [] : dedupe(floored || insisted ? [floorNote, ...d.redFlags] : d.redFlags),
      explanation: finalState === 'safe' ? '' : floored || insisted ? floorNote : d.explanation,
      confidence: d.confidence,
      route: d.route,
      trigger: input.trigger,
      bytesSentToCloud: d.bytesSentToCloud ?? 0,
      redactionCount: d.redactionCount ?? 0,
      failSafe: d.failSafe ?? false,
      cloudUnreachable: d.cloudUnreachable ?? false,
      ...(d.wrongSide ? { wrongSide: true } : {}),
      ...(cloudFailure ? { cloudFailure } : {}),
      ...(d.modelDownloading ? { modelDownloading: true } : {}),
      promptVersion: config.promptVersion,
      elapsedMs: now() - started,
      ...(d.language && finalState !== 'safe' ? { explanationLanguage: d.language } : {}),
      // The whole request, so "This is everything Tripwire sent" is true. Its size is already bounded by maxModelChars.
      ...(d.sent ? { sentPreview: d.sent } : {}),
    };
  };

  /** Deterministic verdict for when no model can be reached. */
  const rulesVerdict = (failSafe: boolean, attempt?: CloudAttempt, wrongSide = false): Verdict => {
    const { low, rulesOnlyCaution } = config.thresholds;
    // After a model failure the bar for caution drops to LOW: never silently pass.
    const cautionAt = failSafe ? low : rulesOnlyCaution;
    // With no model to tell the difference, a page that is plainly about scams is left alone.
    const flagged = signals.ruleScore >= cautionAt && !(aboutScams && input.trigger === 'passive');
    return finish({
      // Rules alone never trip a passive scan: map into the caution band.
      score: flagged ? Math.max(low, Math.min(signals.ruleScore, config.thresholds.high - 1)) : Math.min(signals.ruleScore, low - 1),
      scamType: signals.suggestedType,
      redFlags: ruleFlags(signals),
      explanation: failSafe ? EXPLANATION.failSafe : EXPLANATION.rulesOnly,
      confidence: 0.4,
      route: 'rules_only',
      failSafe: failSafe && flagged,
      allowTrip: false,
      ...attempt,
      wrongSide,
    });
  };

  // ── Stage 2: the gate. A passive scan with no warning signs never reaches a model. ──
  const { asked, localLook, cloudLook } = gate(input, read);
  if (input.trigger === 'passive' && !localLook) {
    return finish({ score: 0, scamType: 'none', redFlags: [], explanation: '', confidence: 1, route: 'not_checked' });
  }
  if (asked && input.nothingAskedYet && !input.neverSafe) {
    return finish({
      score: 0,
      scamType: 'none',
      redFlags: [],
      explanation: '',
      confidence: 1,
      route: 'not_checked',
    });
  }

  let status: OnDeviceStatus;
  try {
    status = await engine.onDeviceStatus();
  } catch {
    status = 'unavailable';
  }

  // The redacted cloud call, shared by stages 3 and 5.
  const runCloud = async (
    redactor: ModelRedactor | null,
  ): Promise<
    | { kind: 'ok'; analysis: CloudAnalysis; bytes: number; redactionCount: number; sent: string }
    | { kind: 'unreachable' | 'invalid'; attempt?: CloudAttempt }
    | { kind: 'gate_closed'; wrongSide?: boolean }
  > => {
    let redaction;
    try {
      redaction = await redactForCloud(text, redactor);
    } catch (err) {
      if (err instanceof PrivacyInvariantError) return { kind: 'gate_closed', wrongSide: true };
      throw err;
    }
    if (!redaction.safeToSend) {
      cloudFailure = 'gate_closed';
      return { kind: 'gate_closed' };
    }
    const prompt = buildCloudPrompt(redaction.text, ctx);
    const result = await callValidated(
      () => withTimeout(engine.analyzeInCloud(prompts.cloudSystem, prompt, config.cloudModel), timeouts.cloudMs, 'cloud analysis'),
      CloudAnalysisSchema,
      deps.cloudBackoffMs,
    );
    if (!result.ok) {
      cloudFailure =
        result.reason === 'wrong_side' || result.reason === 'invalid' ? 'invalid' : result.timedOut ? 'timeout' : result.quota ? 'quota' : 'network';
    }
    // An answer that was invalid, or a request that timed out, means the redacted text left
    // (or may have), so the verdict must not claim that nothing left the computer. A request
    // that failed outright (offline) never got out.
    const attempt: CloudAttempt | undefined =
      !result.ok && (result.reason !== 'unreachable' || result.timedOut)
        ? { bytesSentToCloud: utf8Bytes(prompt), redactionCount: redaction.redactionCount, sent: prompt }
        : undefined;
    // (The cloud call never reports 'wrong_side'; it is treated as invalid if it ever did.)
    if (!result.ok) return { kind: result.reason === 'unreachable' ? 'unreachable' : 'invalid', attempt };
    // Everything Tripwire wrote into the request about this page: the redacted text plus the
    // site name and the lines around it. (The fixed instructions are the same for every page.)
    return { kind: 'ok', analysis: result.value, bytes: utf8Bytes(prompt), redactionCount: redaction.redactionCount, sent: prompt };
  };

  /** The cloud alone decides (no on-device model, or it failed); rules if the cloud cannot. */
  const cloudOnly = async (
    failSafeIfUnreachable: boolean,
    redactor: ModelRedactor | null = null,
    route: 'cloud_fallback' | 'device_then_cloud' = 'cloud_fallback',
  ): Promise<Verdict> => {
    const cloud = await runCloud(redactor);
    if (cloud.kind !== 'ok') {
      return rulesVerdict(
        failSafeIfUnreachable || cloud.kind === 'invalid',
        cloud.kind === 'gate_closed' ? undefined : cloud.attempt,
        cloud.kind === 'gate_closed' && cloud.wrongSide === true,
      );
    }
    const a = cloud.analysis;
    return finish({
      score: a.riskScore,
      scamType: a.scamType,
      redFlags: a.redFlags,
      explanation: a.plainEnglishExplanation,
      confidence: a.confidence,
      route,
      bytesSentToCloud: cloud.bytes,
      redactionCount: cloud.redactionCount,
      sent: cloud.sent,
      allowTrip: a.confidence >= config.thresholds.minTripConfidence,
      language: language?.code,
      ...(route === 'cloud_fallback' && (status === 'downloadable' || status === 'downloading') ? { modelDownloading: true } : {}),
    });
  };

  // ── Stage 3: no on-device model. The cloud alone, and only past the stricter gate. ──
  if (status !== 'available') {
    // Without a private on-device check, a card field alone is not enough
    // reason to send a (redacted) checkout page anywhere.
    // With no on-device model something would have to leave the device, so the bar is higher.
    if (!cloudLook) {
      return finish({ score: 0, scamType: 'none', redFlags: [], explanation: '', confidence: 1, route: 'not_checked' });
    }
    // This page passed the stricter gate. If the cloud cannot answer (quota, network, timeout),
    // the rules decide with the fail-safe (lower) caution bar, not the normal one.
    return cloudOnly(true);
  }

  // ── Stage 4: on-device triage, and the verdicts the device may give alone. ──
  const triage = await callValidated(
    () =>
      withTimeout(
        engine.triageOnDevice(prompts.triageSystem, buildTriagePrompt(text, ctx)),
        timeouts.onDeviceMs,
        'on-device triage',
      ),
    TriageSchema,
  );

  if (!triage.ok && triage.reason === 'wrong_side') {
    // Chrome says the private check ran in the cloud. Stop here: no second model, nothing more
    // sent, built-in rules with the fail-safe floor, and the verdict says what happened.
    return rulesVerdict(true, undefined, true);
  }
  if (!triage.ok) {
    // The on-device model is here but did not answer (busy, timed out, invalid). Only past the
    // stricter gate, and only with the on-device redaction (which closes the gate if the device
    // fails again), may a copy go to the cloud. Otherwise the built-in rules, with the fail-safe floor.
    // A timeout on a slow machine is not a warning sign, so the normal caution bar applies; only a model
    // that answered with nonsense lowers it.
    if (!cloudLook) return rulesVerdict(triage.reason === 'invalid');
    return cloudOnly(true, onDeviceRedactor(engine, prompts.redactSystem, timeouts.onDeviceMs), 'device_then_cloud');
  }

  const t = triage.value;
  const { low, high, minTripConfidence, minCorroboration } = config.thresholds;

  // The small model's "safe" is not final when the built-in rules found strong evidence,
  // or when the page is trying to talk its way past a checker.
  const overruled = steering || signals.ruleScore >= config.thresholds.rulesOnlyCaution;
  if (t.riskScore < low && !overruled) {
    return finish({
      score: t.riskScore,
      scamType: 'none',
      redFlags: [],
      explanation: '',
      confidence: t.confidence,
      route: 'on_device',
    });
  }

  // A local pause needs a second, independent signal besides the small model's own score:
  // either the keyword rules, or the full shape of a scam (an ask for money, plus secrecy or
  // an ask no shop makes, plus pressure or a number to call). The second lets quiet scams that use
  // none of the listed phrases be decided on the device instead of going to the cloud.
  // A price and a card number box are what every honest checkout has, so they do not count here:
  // it takes secrecy, or an ask no real shop makes.
  const fullShape = shape.moneyAsk && (shape.secrecy || shape.sensitiveAsk) && (shape.pressure || shape.hasPhone);
  const corroborated = t.confidence >= minTripConfidence && (signals.ruleScore >= minCorroboration || fullShape);
  // A page about scams never trips on the device model alone: the stronger model has to agree.
  if (t.riskScore >= high && corroborated && !aboutScams && !scamWordsPlusAsks) {
    // Local verdict. Nothing leaves the device.
    return finish(
      await localise({
        score: t.riskScore,
        scamType: t.scamType,
        redFlags: t.redFlags.length ? t.redFlags : ruleFlags(signals),
        explanation: EXPLANATION.localTrip,
        confidence: t.confidence,
        route: 'on_device',
        allowTrip: true,
      }),
    );
  }

  // ── Stage 5: the device is unsure. Redact on the device, then ask the cloud. ──
  const cloud = await runCloud(onDeviceRedactor(engine, prompts.redactSystem, timeouts.onDeviceMs));
  if (cloud.kind === 'ok') {
    const a = cloud.analysis;
    // The device was unsure, which is the only reason the cloud was asked. If the
    // stronger model is confident the page is fine, that settles it: a leftover
    // device vote must never turn an ordinary page into a warning.
    const cleared = a.riskScore < low && a.confidence >= minTripConfidence && !steering;
    // Otherwise the cloud model leads and the device model keeps a vote.
    const merged = cleared ? a.riskScore : Math.round(0.6 * a.riskScore + 0.4 * t.riskScore);
    return finish({
      score: merged,
      scamType: cleared ? 'none' : a.scamType !== 'none' ? a.scamType : t.scamType,
      // In another language only the cloud wrote translated reasons; do not mix in English ones.
      redFlags: cleared ? [] : language && a.redFlags.length ? a.redFlags : [...a.redFlags, ...t.redFlags],
      language: language?.code,
      explanation: a.plainEnglishExplanation,
      confidence: Math.max(a.confidence, t.confidence),
      route: 'device_then_cloud',
      bytesSentToCloud: cloud.bytes,
      redactionCount: cloud.redactionCount,
      sent: cloud.sent,
      allowTrip: a.riskScore >= high && a.confidence >= minTripConfidence,
    });
  }

  // ── Stage 6: no second opinion (offline, invalid, or the privacy gate closed). ──
  // For a page about scams the small model's word alone is not enough to interrupt someone reading.
  if (aboutScams && input.trigger === 'passive') {
    return finish({ score: Math.min(t.riskScore, low - 1), scamType: 'none', redFlags: [], explanation: '', confidence: t.confidence, route: 'on_device' });
  }
  // The device said "safe" but was overruled, and there is no second opinion: the rules decide, as a caution.
  if (t.riskScore < low) {
    return finish({
      score: Math.max(low, Math.min(signals.ruleScore, high - 1)),
      scamType: signals.suggestedType,
      redFlags: ruleFlags(signals),
      explanation: steering ? EXPLANATION.steering : EXPLANATION.rulesOnly,
      confidence: 0.4,
      route: 'on_device',
      cloudUnreachable: cloud.kind === 'unreachable',
      allowTrip: false,
      ...attemptOf(cloud),
    });
  }
  // Otherwise the on-device verdict stands on its own, and nothing was sent.
  return finish(
    await localise({
      score: t.riskScore,
      scamType: t.scamType,
      redFlags: t.redFlags.length ? t.redFlags : ruleFlags(signals),
      explanation: EXPLANATION.localCaution,
      confidence: t.confidence,
      route: 'on_device',
      cloudUnreachable: cloud.kind === 'unreachable',
      failSafe: cloud.kind === 'invalid',
      ...attemptOf(cloud),
      // Same rule as stage 4: a page full of scam words plus asks is never tripped by the device alone.
      allowTrip: corroborated && !scamWordsPlusAsks,
    }),
  );
}

/**
 * Re-read an existing page verdict in light of a risky action (card entry,
 * remote-access download). Used when the action happens after the scan.
 */
export function escalateForAction(verdict: Verdict, trigger: Trigger, config: TripwireConfig): Verdict {
  if (trigger === 'passive') return verdict;
  if (verdict.riskScore < config.thresholds.low && !verdict.failSafe) return { ...verdict, trigger };
  return { ...verdict, trigger, state: 'tripped' };
}
