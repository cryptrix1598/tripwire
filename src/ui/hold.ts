/**
 * The urgency breaker. Scams run on "act now", so for the asks that are never
 * legitimate when someone contacts you (gift cards, crypto or wire, a remote-access
 * program), "continue" is held for five minutes. Nothing can make it shorter;
 * the person can make it longer.
 */
import type { Trigger } from '../inference/schemas';

export const HOLD_MS = 5 * 60_000;

/** The pauses that get the hold. */
export const HOLD_TRIGGERS: ReadonlySet<Trigger> = new Set<Trigger>(['gift_card', 'crypto_wire', 'remote_download', 'money_transfer']);

/** "4:59" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * When a hold ends. The first time a page is held it ends HOLD_MS from now; asking again
 * keeps the same end, so reloading or reopening the page does not restart or skip it;
 * "wait longer" adds HOLD_MS from whichever is later, now or the current end.
 */
export function nextHoldEnd(existing: number | undefined, now: number, extend: boolean, holdMs = HOLD_MS): number {
  if (extend) return Math.max(existing ?? now, now) + holdMs;
  return existing ?? now + holdMs;
}
