/**
 * The shape of a request, independent of any keyword list.
 *
 * A held-out test showed the keyword gate was too narrow: quiet scams (a
 * "grandchild" needing bail, a utility shut-off notice, a customs fee) never
 * reached a model. Scams differ in wording but share a shape: they ask for
 * money or credentials, and add pressure, secrecy or a number to call. This
 * module recognises that shape with broad word classes, and picks out the
 * sentences that carry it so the models read a short excerpt instead of a
 * whole long page.
 */
const MONEY =
  /[$£€]\s?\d|\b(?:pay(?:ment|ing)?|fees?|charges?|deposit|transfer|wire|refund(?:ed|s)?|bail|cash|gift\s?cards?|prepaid|vouchers?|money\s?order|bitcoin|usdt|crypto(?:currency)?|western union|moneypak|zelle|savings|balance|invoice)\b/i;
const PRESSURE =
  /\b(?:today|right now|immediately|urgent(?:ly)?|as soon as possible|asap|hurry|quickly|final (?:notice|warning|courtesy)|within \d+\s*(?:minutes?|hours?|days?)|before \d|expires?|deadline|act now|last chance|suspended|disconnect(?:ed|ion)?|forfeited|inactive|locked|frozen|arrest|warrant)\b/i;
const SECRECY =
  /\b(?:do(?:n't| not) (?:tell|mention|discuss|contact|visit|telephone)|keep (?:this|it|the [a-z ]{0,24}?) ?(?:confidential|private|secret|quiet|between us|inside)|(?:stay|remain) on the line|confidential|just say it is|say it is for)\b/i;
const CREDENTIAL =
  /\b(?:card number|security code|cvv|cvc|verification code|one-time (?:code|passcode|password)|passcode|password|pin\b|social security|medicare number|date of birth|bank account|online banking|remote (?:access|session|support)|screen.?share|support session|read (?:me |him |her |them )?the (?:numbers|codes))\b/i;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/;

/**
 * Asks that an honest checkout does not make. A shop asks for a card number and its security
 * code; it does not ask for a Social Security number, a one-time code, your online banking
 * or a look at your screen. (A corpus run paused an ordinary checkout before this distinction.)
 */
const SENSITIVE =
  /\b(?:social security|medicare number|online banking|remote (?:access|session|support)|screen.?share|support session|verification code|one-time (?:code|passcode|password)|passcode|password|date of birth|read (?:me |him |her |them )?the (?:numbers|codes)|voucher numbers|card numbers and pins)\b/i;

export interface Shape {
  /** An ask a real shop would not make (see SENSITIVE). */
  sensitiveAsk: boolean;
  moneyAsk: boolean;
  pressure: boolean;
  secrecy: boolean;
  credentialAsk: boolean;
  hasPhone: boolean;
}

export function detectShape(text: string): Shape {
  return {
    sensitiveAsk: SENSITIVE.test(text),
    moneyAsk: MONEY.test(text),
    pressure: PRESSURE.test(text),
    secrecy: SECRECY.test(text),
    credentialAsk: CREDENTIAL.test(text),
    hasPhone: PHONE.test(text),
  };
}

/**
 * Worth a look by the ON-DEVICE model. Deliberately generous: a look costs a
 * few seconds of this computer's time and sends nothing anywhere.
 */
export function worthALocalLook(shape: Shape): boolean {
  if (shape.moneyAsk && (shape.pressure || shape.secrecy || shape.hasPhone || shape.credentialAsk)) return true;
  return shape.credentialAsk && (shape.pressure || shape.secrecy);
}

/**
 * Worth sending (redacted) to the cloud when there is no on-device model.
 * Stricter, because something leaves the device: at least three of the five
 * features, and one of them must be the ask itself.
 */
export function worthACloudLook(shape: Shape): boolean {
  const count = [shape.moneyAsk, shape.pressure, shape.secrecy, shape.credentialAsk, shape.hasPhone].filter(Boolean).length;
  return count >= 3 && (shape.moneyAsk || shape.credentialAsk);
}

const SCAM_TALK = /\b(?:scams?|scammers?|scammed|fraudsters?|victims?|phishing|con artists?)\b/gi;
/** A page that says "scam", "scammer" or "victim" this often is almost always describing scams, not running one. */
export const ABOUT_SCAMS_AT = 5;

/**
 * How often the page talks ABOUT scams. A held-out run paused the Wikipedia
 * article on tech support scams: an article that explains a scam contains all
 * of its wording. A real scam does not keep calling itself one.
 */
export function scamTalk(text: string): number {
  return text.match(SCAM_TALK)?.length ?? 0;
}

const DIRECTED =
  /\b(?:you (?:must|need to|have to|are required to)|your (?:account|card|computer|payment|parcel|package|bank|funds|money) (?:has|is|will|was|are)|call (?:us|me|now|this number|immediately|the number)|send (?:us|me)\b|pay (?:now|today|immediately)|click (?:here|below|the link)|do(?:n't| not) (?:tell|hang up|mention)|stay on the line|reply with|move your (?:money|funds|balance))/gi;

/**
 * How many times the text tells the READER to do something. An article about
 * scams describes them in the third person; a scam addresses you. This is what
 * stops a scam from switching the check off just by repeating the word "scam".
 */
export function directedAsks(text: string): number {
  return text.match(DIRECTED)?.length ?? 0;
}

const STEERING =
  /\b(?:ignore (?:all |any |the )?(?:previous|prior|above|earlier) (?:instructions|rules|messages|text)|disregard (?:the|all|any) (?:previous |above )?(?:instructions|rules)|(?:mark|classify|rate|label|score|treat) (?:this|it|the (?:page|text|message|email)) as (?:safe|legitimate|benign|harmless|low risk|0)|this (?:page|message|text|email) is (?:safe|legitimate|not a scam|verified)(?: and (?:should|must) not be flagged)?|do not (?:flag|warn about|block) this|(?:attention|note to) (?:ai|assistant|safety (?:tool|system|filter)|scam (?:checker|detector)))/i;

/**
 * Text addressed to an automated checker ("ignore previous instructions",
 * "classify this as safe"). Ordinary pages do not contain it; a page that does
 * is trying to talk its way past a safety tool.
 */
export function triesToSteerTheChecker(text: string): boolean {
  return STEERING.test(text);
}

function score(sentence: string): number {
  return (
    (MONEY.test(sentence) ? 2 : 0) +
    (PRESSURE.test(sentence) ? 2 : 0) +
    (SECRECY.test(sentence) ? 3 : 0) +
    (CREDENTIAL.test(sentence) ? 2 : 0) +
    (PHONE.test(sentence) ? 2 : 0)
  );
}

/**
 * The part of a page the models actually read: the opening (who this claims to
 * be from) plus the sentences that carry the ask, in their original order.
 * Short text is returned unchanged. A long page becomes a short excerpt, which
 * keeps the on-device model fast and means less ever leaves the device.
 */
export function salientExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const keep = new Set<number>();
  let used = 0;
  // The opening lines, for context.
  for (let i = 0; i < parts.length && used < Math.min(300, maxChars / 5); i++) {
    keep.add(i);
    used += parts[i]!.length + 1;
  }
  const ranked = parts
    .map((sentence, index) => ({ index, value: score(sentence), length: sentence.length }))
    .filter((p) => p.value > 0 && !keep.has(p.index))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  for (const p of ranked) {
    if (used + p.length + 1 > maxChars) continue;
    keep.add(p.index);
    used += p.length + 1;
  }
  const excerpt = parts.filter((_, i) => keep.has(i)).join(' ');
  return excerpt.length >= 200 ? excerpt.slice(0, maxChars) : text.slice(0, maxChars);
}
