/**
 * Family Guardian data model, shared by the extension and the dashboard.
 *
 * Firestore layout
 *   pairingCodes/{code}                     { deviceId, createdAt, expiresAt }
 *   devices/{deviceId}                      { createdAt }
 *   devices/{deviceId}/guardians/{uid}      { code, pairedAt }
 *   devices/{deviceId}/alerts/{alertId}     GuardianAlert
 *   guardians/{uid}/people/{deviceId}       { nickname, addedAt }
 *
 * `deviceId` is the anonymous Firebase Auth uid of the protected person's
 * extension. Security rules (firestore.rules) enforce who can touch what, and
 * also enforce the exact shape of an alert, so raw page or email content
 * cannot be stored even by a modified client.
 */
import { SCAM_TYPES, TRIGGERS, type ScamType, type Trigger } from '../inference/schemas';
import { ALERT_SUMMARY, type Outcome } from '../ui/copy';

export const PAIRING_TTL_MS = 5 * 60 * 1000;
/** What a family member's first name may contain. The security rules check the same thing. */
export const GUARDIAN_NAME_PATTERN = /^\p{L}[\p{L} .'-]{0,39}$/u;

// Eight digits (a hundred million codes): guessing a live one within its few minutes is not practical.
export const PAIRING_CODE_PATTERN = /^\d{8}$/;
/** The only fields an alert may contain. Mirrored in firestore.rules. */
export const ALERT_FIELDS = ['createdAt', 'scamType', 'summary', 'action', 'outcome'] as const;
export const ALERT_SUMMARY_MAX = 200;

export interface GuardianAlertData {
  scamType: ScamType;
  /** One fixed sentence chosen by scam type. Never derived from page content. */
  summary: string;
  /** The action that tripped. */
  action: Trigger;
  outcome: Outcome;
}

/**
 * Build the alert payload. Everything here comes from enums and fixed copy
 * (always the English sentence, which the security rules pin exactly);
 * there is deliberately no parameter through which page text could arrive.
 */
export function buildAlert(scamType: ScamType, trigger: Trigger, outcome: Outcome): GuardianAlertData {
  const safeType: ScamType = (SCAM_TYPES as readonly string[]).includes(scamType) ? scamType : 'other';
  const safeTrigger: Trigger = (TRIGGERS as readonly string[]).includes(trigger) ? trigger : 'passive';
  return {
    scamType: safeType,
    summary: ALERT_SUMMARY[safeType].slice(0, ALERT_SUMMARY_MAX),
    action: safeTrigger,
    outcome: outcome === 'continued' ? 'continued' : 'stopped',
  };
}

/** Six random digits from the platform CSPRNG. */
/**
 * Which waiting links the person's "Yes, allow" applies to: only one made with the code that is
 * on screen now (or, if Tripwire restarted and forgot it, one made within that code's lifetime).
 * Every other waiting link, such as one left over from an older code, is removed.
 */
export function choosePending(
  links: ReadonlyArray<{ id: string; code?: string; pairedAtMs?: number; approved?: boolean }>,
  liveCode: string | null,
  nowMs: number,
): { approve: string[]; remove: string[] } {
  const waiting = links.filter((l) => l.approved !== true);
  const current = (l: (typeof waiting)[number]) =>
    liveCode ? l.code === liveCode : l.pairedAtMs !== undefined && nowMs - l.pairedAtMs <= PAIRING_TTL_MS;
  return { approve: waiting.filter(current).map((l) => l.id), remove: waiting.filter((l) => !current(l)).map((l) => l.id) };
}

/**
 * What the person's answer does to the waiting links. "Yes, allow" approves the
 * links made with the live code and removes stale ones; "No" removes them all.
 */
export function applyDecision(
  plan: { approve: string[]; remove: string[] },
  allow: boolean,
): { approve: string[]; remove: string[] } {
  return allow ? plan : { approve: [], remove: [...plan.approve, ...plan.remove] };
}

export function generatePairingCode(): string {
  const buf = new Uint32Array(1);
  // Values above the last whole multiple of 10^8 are drawn again, so every code is equally likely.
  do crypto.getRandomValues(buf);
  while (buf[0]! >= 4_200_000_000);
  return String(buf[0]! % 100_000_000).padStart(8, '0');
}
