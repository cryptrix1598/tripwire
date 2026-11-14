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
import { withTimeout, type AiEngine, type OnDeviceStatus } from './engine';
import { buildCloudPrompt, buildRedactPrompt, buildTriagePrompt, promptSet, type PromptContext } from './prompts';
import {
  CloudAnalysisSchema,
  RedactionSchema,
  TriageSchema,
  type CloudAnalysis,
  type Route,
  type ScamType,
  type Triage,
  type Trigger,
  type Verdict,
  type VerdictState,
} from './schemas';
import { describeSignals, detectSignals, worthChecking, type Signals } from './signals';

export interface AssessInput {
  /** Visible text of the page or opened email. */
  text: string;
  /** Host only, e.g. "example.com". */
  hostname: string;
  trigger: Trigger;
}

export interface RouterDeps {
  engine: AiEngine;
  config: TripwireConfig;
  now?: () => number;
  /** Per-call time limits, overridable in tests. */
  timeouts?: { onDeviceMs: number; cloudMs: number };
}

const DEFAULT_TIMEOUTS = { onDeviceMs: 25_000, cloudMs: 20_000 };
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

type CallResult<T> = { ok: true; value: T } | { ok: false; reason: 'invalid' | 'unreachable' };

/**
 * Run a model call, validate its output, retry once.
 * `invalid` = the model answered but never produced valid output.
 * `unreachable` = the call itself failed both times (offline, no model, timeout).
 */
async function callValidated<S extends z.ZodType>(
  call: () => Promise<string>,
  schema: S,
): Promise<CallResult<z.output<S>>> {
  let sawAnswer = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await call();
    } catch {
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
  return { ok: false, reason: sawAnswer ? 'invalid' : 'unreachable' };
}

function stateFor(score: number, trigger: Trigger, config: TripwireConfig, allowTrip: boolean): VerdictState {
  const { low, high } = config.thresholds;
  if (score < low) return 'safe';
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
  /** Passive trips need corroboration; this says whether it was present. */
  allowTrip?: boolean;
}

export async function assess(input: AssessInput, deps: RouterDeps): Promise<Verdict> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { engine, config } = deps;
  const timeouts = deps.timeouts ?? DEFAULT_TIMEOUTS;
  const prompts = promptSet(config.promptVersion);
  const text = input.text.slice(0, config.maxScanChars);
  const signals = detectSignals(text, config);
  const ctx: PromptContext = {
    hostname: input.hostname,
    trigger: input.trigger,
    signalSummary: describeSignals(signals),
  };

  const finish = (d: Draft): Verdict => {
    const state = stateFor(d.score, input.trigger, config, d.allowTrip ?? true);
    // Fail-safe verdicts are never allowed to read as "safe".
    const finalState: VerdictState = d.failSafe && state === 'safe' ? 'caution' : state;
    return {
      state: finalState,
      riskScore: d.score,
      scamType: finalState === 'safe' ? 'none' : d.scamType === 'none' ? 'other' : d.scamType,
      redFlags: finalState === 'safe' ? [] : dedupe(d.redFlags),
      explanation: finalState === 'safe' ? '' : d.explanation,
      confidence: d.confidence,
      route: d.route,
      trigger: input.trigger,
      bytesSentToCloud: d.bytesSentToCloud ?? 0,
      redactionCount: d.redactionCount ?? 0,
      failSafe: d.failSafe ?? false,
      cloudUnreachable: d.cloudUnreachable ?? false,
      promptVersion: config.promptVersion,
      elapsedMs: now() - started,
    };
  };

  /** Deterministic verdict for when no model can be reached. */
  const rulesVerdict = (failSafe: boolean): Verdict => {
    const { low, rulesOnlyCaution } = config.thresholds;
    // After a model failure the bar for caution drops to LOW: never silently pass.
    const cautionAt = failSafe ? low : rulesOnlyCaution;
    const flagged = signals.ruleScore >= cautionAt;
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
    });
  };

  // ── Gate ────────────────────────────────────────────────────────────────
  // A passive scan with no warning signs never reaches a model.
  if (input.trigger === 'passive' && !worthChecking(signals)) {
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

  // ── [3] shared by both paths ────────────────────────────────────────────
  const runCloud = async (
    redactor: ModelRedactor | null,
    deviceTriage: Triage | null,
  ): Promise<
    | { kind: 'ok'; analysis: CloudAnalysis; bytes: number; redactionCount: number }
    | { kind: 'unreachable' | 'invalid' | 'gate_closed' }
  > => {
    const redaction = await redactForCloud(text, redactor);
    if (!redaction.safeToSend) return { kind: 'gate_closed' };
    const prompt = buildCloudPrompt(redaction.text, ctx, deviceTriage);
    const result = await callValidated(
      () => withTimeout(engine.analyzeInCloud(prompts.cloudSystem, prompt, config.cloudModel), timeouts.cloudMs, 'cloud analysis'),
      CloudAnalysisSchema,
    );
    if (!result.ok) return { kind: result.reason };
    return { kind: 'ok', analysis: result.value, bytes: utf8Bytes(redaction.text), redactionCount: redaction.redactionCount };
  };

  // ── Fallback path: no on-device model ───────────────────────────────────
  if (status !== 'available') {
    // Without a private on-device check, a card field alone is not enough
    // reason to send a (redacted) checkout page anywhere.
    if (input.trigger !== 'passive' && !worthChecking(signals)) {
      return finish({ score: 0, scamType: 'none', redFlags: [], explanation: '', confidence: 1, route: 'not_checked' });
    }
    const cloud = await runCloud(null, null);
    if (cloud.kind === 'ok') {
      const a = cloud.analysis;
      return finish({
        score: a.riskScore,
        scamType: a.scamType,
        redFlags: a.redFlags,
        explanation: a.plainEnglishExplanation,
        confidence: a.confidence,
        route: 'cloud_fallback',
        bytesSentToCloud: cloud.bytes,
        redactionCount: cloud.redactionCount,
        allowTrip: a.confidence >= config.thresholds.minTripConfidence,
      });
    }
    return rulesVerdict(cloud.kind === 'invalid');
  }

  // ── [1] On-device triage ────────────────────────────────────────────────
  const triage = await callValidated(
    () =>
      withTimeout(
        engine.triageOnDevice(prompts.triageSystem, buildTriagePrompt(text, ctx)),
        timeouts.onDeviceMs,
        'on-device triage',
      ),
    TriageSchema,
  );

  if (!triage.ok) {
    // The on-device model let us down. Try the redacted cloud path; if that
    // fails too, fall back to rules with the fail-safe floor.
    const cloud = await runCloud(null, null);
    if (cloud.kind === 'ok') {
      const a = cloud.analysis;
      return finish({
        score: a.riskScore,
        scamType: a.scamType,
        redFlags: a.redFlags,
        explanation: a.plainEnglishExplanation,
        confidence: a.confidence,
        route: 'cloud_fallback',
        bytesSentToCloud: cloud.bytes,
        redactionCount: cloud.redactionCount,
        allowTrip: a.confidence >= config.thresholds.minTripConfidence,
      });
    }
    return rulesVerdict(true);
  }

  const t = triage.value;
  const { low, high, minTripConfidence, minCorroboration } = config.thresholds;

  if (t.riskScore < low) {
    return finish({
      score: t.riskScore,
      scamType: 'none',
      redFlags: [],
      explanation: '',
      confidence: t.confidence,
      route: 'on_device',
    });
  }

  const corroborated = t.confidence >= minTripConfidence && signals.ruleScore >= minCorroboration;
  if (t.riskScore >= high && corroborated) {
    // Local verdict. Nothing leaves the device.
    return finish({
      score: t.riskScore,
      scamType: t.scamType,
      redFlags: t.redFlags.length ? t.redFlags : ruleFlags(signals),
      explanation: EXPLANATION.localTrip,
      confidence: t.confidence,
      route: 'on_device',
      allowTrip: true,
    });
  }

  // ── [2] + [3] Uncertain middle band ─────────────────────────────────────
  const modelRedactor: ModelRedactor = async (preRedacted) => {
    const r = await callValidated(
      () =>
        withTimeout(
          engine.redactOnDevice(prompts.redactSystem, buildRedactPrompt(preRedacted)),
          timeouts.onDeviceMs,
          'on-device redaction',
        ),
      RedactionSchema,
    );
    return r.ok ? r.value.redactedText : null;
  };

  const cloud = await runCloud(modelRedactor, t);
  if (cloud.kind === 'ok') {
    const a = cloud.analysis;
    // The cloud model has the stronger judgement; the device model keeps a vote.
    const merged = Math.round(0.6 * a.riskScore + 0.4 * t.riskScore);
    return finish({
      score: merged,
      scamType: a.scamType !== 'none' ? a.scamType : t.scamType,
      redFlags: [...a.redFlags, ...t.redFlags],
      explanation: a.plainEnglishExplanation,
      confidence: Math.max(a.confidence, t.confidence),
      route: 'device_then_cloud',
      bytesSentToCloud: cloud.bytes,
      redactionCount: cloud.redactionCount,
      allowTrip: a.riskScore >= high && a.confidence >= minTripConfidence,
    });
  }

  // Cloud not reachable (offline), invalid, or the privacy gate closed.
  // The on-device verdict stands on its own, and nothing was sent.
  return finish({
    score: t.riskScore,
    scamType: t.scamType,
    redFlags: t.redFlags.length ? t.redFlags : ruleFlags(signals),
    explanation: EXPLANATION.localCaution,
    confidence: t.confidence,
    route: 'on_device',
    cloudUnreachable: cloud.kind === 'unreachable',
    failSafe: cloud.kind === 'invalid',
    allowTrip: corroborated,
  });
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
