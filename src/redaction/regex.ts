/**
 * Deterministic redaction. This is the part of the privacy gate that does not
 * depend on any model behaving well: it runs before the on-device model sees
 * the text for redaction, and again on whatever the model hands back.
 *
 * It is deliberately greedy. When in doubt it redacts: losing a tracking number
 * costs the cloud model nothing, leaking an account number costs the user.
 */
import { looksLikeCardNumber } from '../tripwires/luhn';
import { GIVEN_NAMES, NAME_LIKE_BRANDS } from './names';

export const PII_KINDS = [
  'LINK',
  'EMAIL',
  'SSN',
  'CARD',
  'PHONE',
  'WALLET',
  'IP',
  'ACCOUNT',
  'ID',
  'DOB',
  'ADDRESS',
  'NAME',
] as const;
export type PiiKind = (typeof PII_KINDS)[number];

export interface RegexRedaction {
  text: string;
  counts: Record<PiiKind, number>;
  total: number;
  /**
   * The raw values that were removed. Kept in memory only, used for the leak
   * check, never logged, stored or sent.
   */
  found: string[];
}

const TAG = (kind: PiiKind) => `[${kind}]`;
export const TAG_PATTERN = new RegExp(`\\[(?:${PII_KINDS.join('|')})\\]`, 'g');

/* ---------- patterns ---------- */

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const SSN_RE = /(?<![\d-])\d{3}[-\s]\d{2}[-\s]\d{4}(?![\d-])/g;
/** 13 to 19 digits, optionally grouped with single spaces or dashes. */
const CARDLIKE_RE = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;
const PHONE_RE = /(?<![\d.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
/** International form: +country then 2 to 5 groups. Needs 8+ digits in total. */
const PHONE_INTL_RE = /(?<![\d.])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\d)/g;
const WALLET_RE = /\b(?:bc1[ac-hj-np-z02-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40})\b/g;
const IP_RE = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\d|\.\d)/g;
/** Digit groups joined by dashes, 8+ digits in total: ticket, claim and reference numbers. */
const GROUPED_DIGITS_RE = /(?<![\w$.,/:-])\d{2,}(?:[-–]\d{2,}){1,5}(?![\w%/:-])/g;
/** "ending in 4471", "last four digits 1881": partial account and card numbers. */
const ENDING_RE = /\b(ending(?:\s+in)?|last\s+(?:four|4)(?:\s+digits)?(?:\s+(?:are|of|is))?)(\s+)(\d{3,6})\b/gi;
/** One-time codes and PINs: short, but exactly what a scammer wants. */
const CODE_RE = /\b((?:verification\s+|security\s+|one-time\s+|access\s+)?(?:code|passcode|pin|otp)(?:\s+is|\s*:)?\s+)(\d{4,8})\b/gi;
/** Any remaining run of 7+ digits: account, routing, member, order numbers. */
const LONG_DIGITS_RE = /(?<![\w$.,])\d{7,}(?![\w%])/g;
/** Mixed letters and digits, 10+ chars with 5+ digits: tracking and reference codes. */
const ID_RE = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=(?:[A-Za-z]*\d){5})[A-Za-z0-9]{10,}\b/g;
const DOB_RE =
  /(\b(?:dob|d\.o\.b\.?|date of birth|born on)\b[:\s]*)(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|[A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/gi;

const STREET_SUFFIX =
  'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Highway|Hwy|Parkway|Pkwy|Trail|Trl|Square|Sq|Crescent|Cres|Close';
const ADDRESS_RE = new RegExp(
  String.raw`\b\d{1,6}[A-Za-z]?\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?\s+)?(?:[A-Z0-9][A-Za-z0-9'.-]*\s+){1,4}(?:${STREET_SUFFIX})\b\.?` +
    String.raw`(?:,?\s*(?:Apt|Apartment|Suite|Ste|Unit|Flat|#)\.?\s*[A-Za-z0-9-]+)?` +
    String.raw`(?:,?\s+[A-Z][A-Za-z.'-]*(?:\s[A-Z][A-Za-z.'-]*){0,2},?\s+[A-Z]{2}\b\.?(?:\s+\d{5}(?:-\d{4})?)?)?`,
  'g',
);
const PO_BOX_RE = /\bP\.?\s?O\.?\s*Box\s+\d+\b/gi;
const CITY_STATE_ZIP_RE = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g;

/** Words that follow a greeting but are not a person's name. */
const NOT_A_NAME = new Set(
  [
    'customer', 'valued', 'sir', 'madam', 'user', 'member', 'client', 'friend', 'team', 'all', 'there',
    'winner', 'account', 'cardholder', 'subscriber', 'taxpayer', 'beneficiary', 'shopper', 'guest',
    'everyone', 'folks', 'neighbor', 'neighbour', 'applicant', 'recipient', 'patient', 'resident',
    'the', 'your', 'our', 'this', 'that', 'we', 'you', 'again', 'and',
    'madame', 'monsieur', 'señor', 'señora', 'cliente', 'clientes', 'usuario', 'utilisateur', 'amigo', 'amiga', 'ami', 'amie',
    'todos', 'tous', 'familia', 'famille', 'vecino', 'voisin',
  ],
);
// Latin letters with accents count too, so a surname such as Hernández or Lefèvre is removed whole.
const NAME_WORD = String.raw`[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+(?:['-][A-ZÀ-ÖØ-Þ]?[a-zà-öø-ÿ]+)?`;
// English, Spanish and French titles ("M." needs its full stop: a bare M is too common).
const TITLE = String.raw`(?:(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sr|Sra|Srta|Mme|Mlle)\.?|Don|Doña|Madame|Monsieur|Mademoiselle|M\.)`;
const GREETING_RE = new RegExp(
  String.raw`(?<![\p{L}])(Dear|Hi|Hello|Hey|Attention|Greetings|Good\s+(?:morning|afternoon|evening)|Hola|Buenos\s+días|Buenas\s+(?:tardes|noches)|Estimad[oa]s?|Querid[oa]s?|Bonjour|Bonsoir|Salut|Cher|Chère|Chers)(,?\s+)((?:${TITLE}\s+)?${NAME_WORD}(?:\s+${NAME_WORD}){0,2})(?=[\s,:;!.]|$)`,
  'gu',
);
const TITLED_NAME_RE = new RegExp(String.raw`\b${TITLE}\s+${NAME_WORD}(?:\s+${NAME_WORD})?`, 'g');
const LABELED_NAME_RE = new RegExp(
  String.raw`\b(Name|Full name|Account holder|Account name|Cardholder name|Cardholder|Customer name|Recipient|Beneficiary name|Signed|Sincerely|Regards|Best regards|Kind regards|Thank you|Thanks|Love|Yours truly|From)(\s*[:,]?\s+)(${NAME_WORD}(?:[ \t]+${NAME_WORD}){1,2})(?=[\s,.;!]|$)`,
  'g',
);
/**
 * A single name on its own after a sign-off ("Regards, Tom"), and a full name after a
 * self-introduction ("This is Tom Baker"). Off the device, these were the commonest way an
 * unusual name got past redaction.
 */
const SIGNOFF_NAME_RE = new RegExp(
  String.raw`\b(Sincerely|Regards|Best regards|Kind regards|Warm regards|Best wishes|Thanks|Thank you|Cheers|Love|Warmly|Yours truly|Yours sincerely|Yours faithfully)(,[ \t]*\n?[ \t]*|[ \t]*\n[ \t]*)(${NAME_WORD})(?=[\s,.;!]|$)`,
  'g',
);
const INTRO_NAME_RE = new RegExp(String.raw`\b(This is|My name is|I am|I'm)(\s+)(${NAME_WORD}\s+${NAME_WORD})(?=[\s,.;!]|$)`, 'g');
/** A common given name (capitalised), with up to two surname words after it. */
const SURNAME_WORD = String.raw`(?:O'[A-Z][a-z]+|Mc[A-Z][a-z]+|${NAME_WORD})`;
const GIVEN_NAME_RE = new RegExp(
  String.raw`\b(?:${[...GIVEN_NAMES].map((n) => n[0]!.toUpperCase() + n.slice(1)).join('|')})\b(?: ${SURNAME_WORD}){0,2}`,
  'g',
);

/* ---------- implementation ---------- */

function emptyCounts(): Record<PiiKind, number> {
  return Object.fromEntries(PII_KINDS.map((k) => [k, 0])) as Record<PiiKind, number>;
}

/** Keep the site, drop everything that could identify the person or the session. */
function redactUrl(raw: string): { text: string; changed: boolean } {
  try {
    const u = new URL(raw);
    const bare = `${u.protocol}//${u.host}`;
    const hasMore = u.pathname.length > 1 || u.search.length > 0 || u.hash.length > 0 || u.username.length > 0;
    if (!hasMore) return { text: raw, changed: false };
    return { text: `${bare}/${TAG('LINK')}`, changed: true };
  } catch {
    return { text: TAG('LINK'), changed: true };
  }
}

export function regexRedact(input: string): RegexRedaction {
  const counts = emptyCounts();
  const found: string[] = [];
  let text = input;

  const hit = (kind: PiiKind, raw: string) => {
    counts[kind] += 1;
    found.push(raw);
  };

  text = text.replace(URL_RE, (m) => {
    // Trailing punctuation belongs to the sentence, not the link.
    const trail = /[.,;:!?]+$/.exec(m)?.[0] ?? '';
    const core = trail ? m.slice(0, -trail.length) : m;
    // Already redacted on an earlier pass ("https://site/[LINK" + "]"): leave it alone.
    if (/\/\[LINK$/.test(core)) return m;
    const r = redactUrl(core);
    if (r.changed) hit('LINK', core);
    return r.text + trail;
  });

  text = text.replace(EMAIL_RE, (m) => {
    hit('EMAIL', m);
    return TAG('EMAIL');
  });

  // Whole tokens first, so later digit rules cannot chew pieces out of them.
  text = text.replace(WALLET_RE, (m) => {
    hit('WALLET', m);
    return TAG('WALLET');
  });

  text = text.replace(ID_RE, (m) => {
    hit('ID', m);
    return TAG('ID');
  });

  text = text.replace(SSN_RE, (m) => {
    hit('SSN', m);
    return TAG('SSN');
  });

  text = text.replace(CARDLIKE_RE, (m) => {
    const digits = m.replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19) return m;
    const kind: PiiKind = looksLikeCardNumber(digits) ? 'CARD' : 'ACCOUNT';
    hit(kind, m);
    return TAG(kind);
  });

  text = text.replace(IP_RE, (m) => {
    if (!m.split('.').every((p) => Number(p) <= 255)) return m;
    hit('IP', m);
    return TAG('IP');
  });

  text = text.replace(PHONE_INTL_RE, (m) => {
    if (m.replace(/\D/g, '').length < 8) return m;
    hit('PHONE', m);
    return TAG('PHONE');
  });

  text = text.replace(PHONE_RE, (m) => {
    hit('PHONE', m);
    return TAG('PHONE');
  });

  text = text.replace(DOB_RE, (_m, label: string, value: string) => {
    hit('DOB', value);
    return `${label}${TAG('DOB')}`;
  });

  text = text.replace(ENDING_RE, (_m, label: string, gap: string, digits: string) => {
    hit('ACCOUNT', digits);
    return `${label}${gap}${TAG('ACCOUNT')}`;
  });

  text = text.replace(CODE_RE, (_m, label: string, digits: string) => {
    hit('ID', digits);
    return `${label}${TAG('ID')}`;
  });

  text = text.replace(GROUPED_DIGITS_RE, (m) => {
    // Leave ISO dates readable; everything else of this shape is a reference number.
    if (/^\d{4}[-–]\d{2}[-–]\d{2}$/.test(m)) return m;
    if (m.replace(/\D/g, '').length < 8) return m;
    hit('ACCOUNT', m);
    return TAG('ACCOUNT');
  });

  // Addresses before the generic digit sweep, so house numbers go with their street.
  text = text.replace(ADDRESS_RE, (m) => {
    hit('ADDRESS', m);
    return TAG('ADDRESS');
  });
  text = text.replace(PO_BOX_RE, (m) => {
    hit('ADDRESS', m);
    return TAG('ADDRESS');
  });
  text = text.replace(CITY_STATE_ZIP_RE, (m) => {
    hit('ADDRESS', m);
    return TAG('ADDRESS');
  });

  text = text.replace(LONG_DIGITS_RE, (m) => {
    hit('ACCOUNT', m);
    return TAG('ACCOUNT');
  });

  text = text.replace(GREETING_RE, (m, greeting: string, gap: string, name: string) => {
    const first = name.replace(new RegExp(`^${TITLE}\\s+`), '').split(/\s+/)[0]?.toLowerCase() ?? '';
    if (NOT_A_NAME.has(first)) return m;
    hit('NAME', name);
    return `${greeting}${gap}${TAG('NAME')}`;
  });

  text = text.replace(LABELED_NAME_RE, (m, label: string, gap: string, name: string) => {
    const first = name.split(/\s+/)[0]?.toLowerCase() ?? '';
    if (NOT_A_NAME.has(first)) return m;
    hit('NAME', name);
    return `${label}${gap}${TAG('NAME')}`;
  });

  for (const re of [SIGNOFF_NAME_RE, INTRO_NAME_RE]) {
    text = text.replace(re, (m, label: string, gap: string, name: string) => {
      const first = name.split(/\s+/)[0]?.toLowerCase() ?? '';
      if (NOT_A_NAME.has(first) || NAME_LIKE_BRANDS.has(first)) return m;
      hit('NAME', name);
      return `${label}${gap}${TAG('NAME')}`;
    });
  }

  text = text.replace(TITLED_NAME_RE, (m) => {
    hit('NAME', m);
    return TAG('NAME');
  });

  // A common given name in ordinary prose, with any surname that follows it.
  text = text.replace(GIVEN_NAME_RE, (m) => {
    const lower = m.toLowerCase();
    if ([...NAME_LIKE_BRANDS].some((brand) => lower.startsWith(brand))) return m;
    hit('NAME', m);
    return TAG('NAME');
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text, counts, total, found };
}

/** How many redaction tags a piece of text contains. */
export function countTags(text: string): number {
  return text.match(TAG_PATTERN)?.length ?? 0;
}

/**
 * Leak check. Returns the raw values that still appear in `candidate`.
 * Values under 4 characters are ignored: they are too short to be personal
 * info on their own and would cause false alarms.
 */
export function findLeaks(candidate: string, rawValues: readonly string[]): string[] {
  const hay = candidate.toLowerCase();
  const leaks: string[] = [];
  for (const raw of rawValues) {
    const v = raw.trim().toLowerCase();
    if (v.length < 4) continue;
    if (hay.includes(v)) leaks.push(raw);
  }
  return leaks;
}
