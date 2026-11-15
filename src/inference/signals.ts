/**
 * Deterministic warning-sign detection. No AI here: just keyword lists (from
 * Remote Config, with local defaults) and a transparent scoring rule.
 *
 * It has three jobs:
 *  1. Gate. Most pages show no warning signs, so no model is ever asked about
 *     them. Tripwire stays invisible and costs nothing.
 *  2. Corroborate. A local-only TRIP needs the on-device model AND these rules
 *     to agree, which keeps false positives down.
 *  3. Fall back. When no model can be reached at all, these rules still give a
 *     cautious, honest verdict.
 */
import type { SignalCategory, TripwireConfig } from '../config/defaults';
import { SIGNAL_CATEGORIES } from '../config/defaults';
import type { ScamType } from './schemas';

/** Categories that are a direct ask for money, access or credentials. */
const ACTION_CATEGORIES: readonly SignalCategory[] = [
  'giftCard',
  'remoteAccess',
  'urgentCall',
  'cryptoWire',
  'credentialPressure',
  'paymentPressure',
];
/** Categories that are pressure tactics rather than asks. */
const PRESSURE_CATEGORIES: readonly SignalCategory[] = ['urgency', 'secrecy', 'impersonation', 'threat'];

export const PHONE_PATTERN =
  /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)|(?<!\d)\+\d{1,3}(?:[\s.-]?\d{2,4}){2,4}(?!\d)/;

export interface Signals {
  matches: Partial<Record<SignalCategory, string[]>>;
  categories: SignalCategory[];
  actionCategories: SignalCategory[];
  hasPhone: boolean;
  /** How many "this page is warning about scams" phrases were found. */
  protective: number;
  /** 0-100. Transparent, rule-based. */
  ruleScore: number;
  suggestedType: ScamType;
}

type Matcher = { category: SignalCategory; phrase: string; re: RegExp };
const matcherCache = new WeakMap<TripwireConfig, { matchers: Matcher[]; protective: RegExp[] }>();

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a tolerant matcher: word-bounded, flexible whitespace, straight or curly apostrophes. */
function phraseToRegex(phrase: string): RegExp {
  const body = escapeRe(phrase.trim().toLowerCase())
    .replace(/\s+/g, '\\s+')
    .replace(/'/g, "['’]");
  const start = /^\w/.test(phrase) ? '(?<![a-z0-9])' : '';
  const end = /\w$/.test(phrase) ? '(?![a-z0-9])' : '';
  return new RegExp(`${start}${body}${end}`, 'i');
}

function compile(config: TripwireConfig) {
  const cached = matcherCache.get(config);
  if (cached) return cached;
  const matchers: Matcher[] = [];
  for (const category of SIGNAL_CATEGORIES) {
    for (const phrase of config.keywords[category] ?? []) {
      if (phrase.trim().length < 3) continue;
      matchers.push({ category, phrase, re: phraseToRegex(phrase) });
    }
  }
  const protective = config.protectivePhrases.filter((p) => p.trim().length >= 3).map(phraseToRegex);
  const compiled = { matchers, protective };
  matcherCache.set(config, compiled);
  return compiled;
}

function suggestType(m: Partial<Record<SignalCategory, string[]>>, text: string): ScamType {
  if (m.giftCard) return 'gift_card';
  if (m.remoteAccess || m.urgentCall) return 'tech_support';
  if (m.cryptoWire) return 'investment_crypto';
  if (/\b(?:package|parcel|delivery|courier|shipment|tracking)\b/i.test(text) && (m.paymentPressure || m.credentialPressure))
    return 'delivery';
  if (/\b(?:irs|internal revenue|social security|medicare|tax)\b/i.test(text)) return 'government_impersonation';
  if (/\b(?:won|winner|prize|lottery|sweepstakes)\b/i.test(text) && m.paymentPressure) return 'prize_lottery';
  if (/\b(?:bank|credit union|debit card|checking account|savings account)\b/i.test(text) && m.credentialPressure)
    return 'bank_impersonation';
  if (m.credentialPressure) return 'phishing_login';
  if (m.paymentPressure) return 'payment_request';
  return 'other';
}

export function detectSignals(text: string, config: TripwireConfig): Signals {
  const { matchers, protective } = compile(config);
  const haystack = text.length > 20000 ? text.slice(0, 20000) : text;
  const matches: Partial<Record<SignalCategory, string[]>> = {};

  for (const { category, phrase, re } of matchers) {
    if (re.test(haystack)) {
      (matches[category] ??= []).push(phrase);
    }
  }

  const categories = SIGNAL_CATEGORIES.filter((c) => matches[c]?.length);
  const actionCategories = categories.filter((c) => ACTION_CATEGORIES.includes(c));
  const pressure = categories.filter((c) => PRESSURE_CATEGORIES.includes(c));
  const hasPhone = PHONE_PATTERN.test(haystack);
  const protectiveCount = protective.reduce((n, re) => n + (re.test(haystack) ? 1 : 0), 0);

  let score = 0;
  actionCategories.forEach((c, i) => {
    score += i === 0 ? 22 : 12;
    score += Math.min(8, ((matches[c]?.length ?? 1) - 1) * 4);
  });
  for (const c of pressure) {
    score += 10;
    score += Math.min(6, ((matches[c]?.length ?? 1) - 1) * 3);
  }

  const has = (c: SignalCategory) => Boolean(matches[c]?.length);
  if (actionCategories.length > 0 && (has('urgency') || has('threat'))) score += 15;
  if (has('giftCard') && has('secrecy')) score += 20;
  if (has('urgentCall') && hasPhone) score += 15;
  if (has('remoteAccess') && (has('urgentCall') || has('impersonation'))) score += 15;
  if (has('cryptoWire') && (matches.cryptoWire ?? []).some((p) => /guarantee|double|risk-free|daily returns/.test(p)))
    score += 12;
  if (has('paymentPressure') && has('credentialPressure')) score += 8;

  // Pages that warn ABOUT scams use the same vocabulary as scams. Dampen hard.
  score -= Math.min(75, protectiveCount * 25);

  return {
    matches,
    categories,
    actionCategories,
    hasPhone,
    protective: protectiveCount,
    ruleScore: Math.max(0, Math.min(100, Math.round(score))),
    suggestedType: suggestType(matches, haystack),
  };
}

/**
 * Is this page worth asking a model about at all? One direct ask, or two
 * different pressure tactics together, is enough. A lone "urgent" is not.
 */
export function worthChecking(signals: Signals): boolean {
  if (signals.actionCategories.length > 0) return true;
  return signals.categories.length >= 2;
}

/** A compact, PII-free description of what the rules found, for prompts. */
/** Plain words for the rule categories. They appear in the "what was sent" receipt, so no internal names. */
const SIGNAL_WORDS: Record<string, string> = {
  giftCard: 'gift cards',
  remoteAccess: 'remote access to the computer',
  urgentCall: 'an urgent phone call',
  cryptoWire: 'crypto or a wire transfer',
  credentialPressure: 'account or identity details',
  paymentPressure: 'an unexpected payment',
  urgency: 'a deadline',
  secrecy: 'secrecy',
  impersonation: 'a well-known name',
  threat: 'a threat',
};

export function describeSignals(signals: Signals): string {
  if (signals.categories.length === 0) return 'none';
  return signals.categories.map((c) => SIGNAL_WORDS[c] ?? c).join(', ') + (signals.hasPhone ? ', a phone number' : '');
}
