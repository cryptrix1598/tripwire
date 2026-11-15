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
export const PAIRING_CODE_PATTERN = /^\d{6}$/;
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
export function generatePairingCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 1_000_000).padStart(6, '0');
}
