/**
 * Schemas for every model response, plus the verdict type the UI consumes.
 *
 * Each model call is constrained twice: once by the response schema handed to
 * Firebase AI Logic (so the model is steered toward valid JSON) and once here
 * with zod (so nothing unvalidated ever reaches the rest of the extension).
 */
import { z } from 'zod';

export const SCAM_TYPES = [
  'none',
  'tech_support',
  'gift_card',
  'bank_impersonation',
  'government_impersonation',
  'delivery',
  'shopping_impersonation',
  'investment_crypto',
  'prize_lottery',
  'romance',
  'payment_request',
  'phishing_login',
  'other',
] as const;
export type ScamType = (typeof SCAM_TYPES)[number];

const redFlag = z
  .string()
  .trim()
  .min(1)
  .transform((s) => (s.length > 180 ? `${s.slice(0, 177)}...` : s));

/** Some models return 0-1 confidence, some 0-100. Accept both, store 0-1. */
const confidence = z
  .number()
  .min(0)
  .max(100)
  .transform((n) => (n > 1 ? n / 100 : n));

export const TriageSchema = z.object({
  riskScore: z.number().min(0).max(100).transform((n) => Math.round(n)),
  scamType: z.enum(SCAM_TYPES),
  redFlags: z.array(redFlag).max(12).transform((a) => a.slice(0, 5)),
  confidence,
});
export type Triage = z.infer<typeof TriageSchema>;

export const CloudAnalysisSchema = TriageSchema.extend({
  plainEnglishExplanation: z
    .string()
    .trim()
    .min(1)
    .transform((s) => (s.length > 400 ? `${s.slice(0, 397)}...` : s)),
});
export type CloudAnalysis = z.infer<typeof CloudAnalysisSchema>;

export const RedactionSchema = z.object({
  redactedText: z.string().min(1),
});
export type RedactionOutput = z.infer<typeof RedactionSchema>;

/**
 * Plain JSON Schema twins of the zod schemas above. These are what get passed
 * to Firebase AI Logic as `responseConstraint` (on-device) and `responseSchema`
 * (cloud). They are plain objects so the same definition works for both.
 */
export const TRIAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    riskScore: { type: 'integer', nullable: false },
    scamType: { type: 'string', enum: [...SCAM_TYPES], nullable: false },
    redFlags: { type: 'array', items: { type: 'string', nullable: false }, nullable: false },
    confidence: { type: 'number', nullable: false },
  },
  nullable: false,
  required: ['riskScore', 'scamType', 'redFlags', 'confidence'],
} as const;

export const CLOUD_JSON_SCHEMA = {
  type: 'object',
  properties: {
    ...TRIAGE_JSON_SCHEMA.properties,
    plainEnglishExplanation: { type: 'string', nullable: false },
  },
  nullable: false,
  required: [...TRIAGE_JSON_SCHEMA.required, 'plainEnglishExplanation'],
} as const;

export const REDACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    redactedText: { type: 'string', nullable: false },
  },
  nullable: false,
  required: ['redactedText'],
} as const;

/** On-device translation of the reasons into the browser's language. */
export const TranslationSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(8),
});

export const TRANSLATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    texts: { type: 'array', items: { type: 'string', nullable: false }, nullable: false },
  },
  nullable: false,
  required: ['texts'],
} as const;

/** What tripped, or 'passive' for a background page/email scan. */
export const TRIGGERS = [
  'passive',
  'card_entry',
  'remote_download',
  'phone_call',
  'gift_card',
  'crypto_wire',
] as const;
export type Trigger = (typeof TRIGGERS)[number];

/**
 * Which path through the hybrid pipeline produced a verdict. The UI shows this
 * honestly on every verdict so the user can see what left their device.
 */
export const ROUTES = [
  /** No risk signals at all; no model was asked. */
  'not_checked',
  /** On-device model only. Zero bytes sent. */
  'on_device',
  /** On-device triage, on-device redaction, then cloud analysis of the redacted text. */
  'device_then_cloud',
  /** No on-device model available. Regex redaction, then cloud. */
  'cloud_fallback',
  /** No model could be reached. Built-in rules only. Zero bytes sent. */
  'rules_only',
] as const;
export type Route = (typeof ROUTES)[number];

export type VerdictState = 'safe' | 'caution' | 'tripped';

export interface Verdict {
  state: VerdictState;
  riskScore: number;
  scamType: ScamType;
  redFlags: string[];
  /** One or two plain sentences. Empty when the state is safe. */
  explanation: string;
  confidence: number;
  route: Route;
  trigger: Trigger;
  /** UTF-8 bytes of everything sent to the cloud model about this page (redacted text, site name, context). 0 for local routes. */
  bytesSentToCloud: number;
  /** How many pieces of personal info were removed before anything was sent. */
  redactionCount: number;
  /** True when a model failed and we fell back to the cautious default. */
  failSafe: boolean;
  /** True when the cloud step was wanted but could not be reached. */
  cloudUnreachable: boolean;
  promptVersion: string;
  elapsedMs: number;
  /**
   * Exactly what was sent to the cloud about this page (redacted text, site name,
   * context), shortened if long. Present only when something was sent, so the
   * person can read it for themselves.
   */
  sentPreview?: string;
  /** Language code of `redFlags` and `explanation` when they are not in English. */
  explanationLanguage?: string;
}
