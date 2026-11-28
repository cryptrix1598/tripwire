/**
 * Shared scoring for the corpus evaluation. Used by the Node script
 * (scripts/eval.ts, rules-only baseline) and by the in-extension diagnostics
 * page (real on-device + cloud run through Firebase AI Logic).
 */
import type { TripwireConfig } from '../config/defaults';
import type { AiEngine } from './engine';
import { assess } from './router';
import type { Route, Trigger, Verdict, VerdictState } from './schemas';

export interface EvalSample {
  id: string;
  label: 'scam' | 'benign';
  category: string;
  hostname: string;
  trigger: Trigger;
  text: string;
}

export interface EvalRow {
  id: string;
  label: 'scam' | 'benign';
  category: string;
  state: VerdictState;
  riskScore: number;
  route: Route;
  bytesSentToCloud: number;
  redactionCount: number;
  failSafe: boolean;
  elapsedMs: number;
  /** Which router step decided (policy.ts), and why a cloud check failed, if one did. */
  decidedBy?: string;
  cloudFailure?: string;
  /** A scam that was flagged, or a benign page left alone. */
  correct: boolean;
}

export interface EvalSummary {
  ranAt: string;
  mode: string;
  promptVersion: string;
  scams: number;
  benign: number;
  detected: number;
  tripped: number;
  falsePositives: number;
  detectionRate: number;
  falsePositiveRate: number;
  routes: Partial<Record<Route, number>>;
  totalBytesSentToCloud: number;
  rows: EvalRow[];
}

export async function runEval(
  samples: readonly EvalSample[],
  engine: AiEngine,
  config: TripwireConfig,
  mode: string,
  onProgress?: (done: number, total: number, row: EvalRow) => void,
): Promise<EvalSummary> {
  const rows: EvalRow[] = [];
  for (const s of samples) {
    let verdict: Verdict;
    try {
      verdict = await assess({ text: s.text, hostname: s.hostname, trigger: s.trigger }, { engine, config });
    } catch {
      // The router is built not to throw; if it ever does, count it as a miss, loudly.
      verdict = {
        state: 'safe', riskScore: -1, scamType: 'none', redFlags: [], explanation: '', confidence: 0,
        route: 'rules_only', trigger: s.trigger, bytesSentToCloud: 0, redactionCount: 0, failSafe: true,
        cloudUnreachable: false, promptVersion: config.promptVersion, elapsedMs: 0,
      };
    }
    const flagged = verdict.state !== 'safe';
    const row: EvalRow = {
      id: s.id,
      label: s.label,
      category: s.category,
      state: verdict.state,
      riskScore: verdict.riskScore,
      route: verdict.route,
      bytesSentToCloud: verdict.bytesSentToCloud,
      redactionCount: verdict.redactionCount,
      failSafe: verdict.failSafe,
      elapsedMs: verdict.elapsedMs,
      ...(verdict.decidedBy ? { decidedBy: verdict.decidedBy } : {}),
      ...(verdict.cloudFailure ? { cloudFailure: verdict.cloudFailure } : {}),
      correct: s.label === 'scam' ? flagged : !flagged,
    };
    rows.push(row);
    onProgress?.(rows.length, samples.length, row);
  }

  const scamRows = rows.filter((r) => r.label === 'scam');
  const benignRows = rows.filter((r) => r.label === 'benign');
  const detected = scamRows.filter((r) => r.state !== 'safe').length;
  const falsePositives = benignRows.filter((r) => r.state !== 'safe').length;
  const routes: Partial<Record<Route, number>> = {};
  for (const r of rows) routes[r.route] = (routes[r.route] ?? 0) + 1;

  return {
    ranAt: new Date().toISOString(),
    mode,
    promptVersion: config.promptVersion,
    scams: scamRows.length,
    benign: benignRows.length,
    detected,
    tripped: scamRows.filter((r) => r.state === 'tripped').length,
    falsePositives,
    detectionRate: scamRows.length ? detected / scamRows.length : 0,
    falsePositiveRate: benignRows.length ? falsePositives / benignRows.length : 0,
    routes,
    totalBytesSentToCloud: rows.reduce((n, r) => n + r.bytesSentToCloud, 0),
    rows,
  };
}
