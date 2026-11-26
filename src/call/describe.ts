/**
 * The phone-call check, by taps instead of typing.
 *
 * Typing while a caller is still talking is hard, so the person answers three questions
 * with big buttons (who they say they are, what they want, how they are acting). This turns
 * the taps into a short, plain description for the same router to check. It is always
 * written in English, whatever language the screen is in, because that is what the
 * on-device model reads best. Anything the person types is added after it.
 */
export const CALL_WHO = ['bank', 'government', 'company', 'family', 'other'] as const;
export const CALL_WANT = ['money', 'safe_account', 'gift_cards', 'crypto', 'code', 'details', 'computer', 'nothing'] as const;
export const CALL_HOW = ['rushing', 'secret', 'stay_on_line', 'patient'] as const;

export type CallWho = (typeof CALL_WHO)[number];
export type CallWant = (typeof CALL_WANT)[number];
export type CallHow = (typeof CALL_HOW)[number];

export interface CallAnswers {
  who?: CallWho;
  want: readonly CallWant[];
  how: readonly CallHow[];
  /** Optional words the person typed. */
  notes?: string;
}

const WHO_TEXT: Record<CallWho, string> = {
  bank: 'The caller says they are from my bank.',
  government: 'The caller says they are from the government, such as the IRS, Social Security, Medicare or the police.',
  company: 'The caller says they are from a well-known company, such as Amazon, Microsoft or Apple.',
  family: 'The caller says they are a family member or friend who is in trouble.',
  other: 'I do not know who the caller is.',
};

const WANT_TEXT: Record<Exclude<CallWant, 'nothing'>, string> = {
  money: 'pay a bill, a fine or a fee',
  safe_account: 'move my money to a new "safe" account to protect it',
  gift_cards: 'buy gift cards and read them the numbers',
  crypto: 'send cryptocurrency or put cash into a Bitcoin machine',
  code: 'read them a code that was just sent to my phone',
  details: 'give my Social Security, Medicare or bank account details',
  computer: 'install a program or let them into my computer',
};

const HOW_TEXT: Record<CallHow, string> = {
  rushing: 'They are rushing me and say something bad will happen if I do not act right now.',
  secret: 'They told me to keep this secret and not to tell my bank or my family.',
  stay_on_line: 'They want me to stay on the line while I do it.',
  patient: 'They are calm and patient, and said I can call them back.',
};

/**
 * Asks that are never safe on a call you did not expect: no real bank, government office or
 * company asks for these. When any is tapped, the answer is at least "be careful", whatever a
 * model says.
 */
// Moving money to a "safe account" is the pattern the FTC describes most: a real bank never asks.
export const NEVER_SAFE_ON_A_CALL: readonly CallWant[] = ['safe_account', 'gift_cards', 'crypto', 'code', 'details', 'computer'];

export function neverSafe(answers: CallAnswers): boolean {
  return answers.want.some((w) => NEVER_SAFE_ON_A_CALL.includes(w));
}

/**
 * The caller has asked for nothing yet and is not pressing: there is nothing to judge, so no
 * model is asked. (A first run of corpus/calls.json told people to hang up on two such calls,
 * from a "bank" and a "government office", only because of who the caller said they were.)
 */
export function nothingAskedYet(answers: CallAnswers): boolean {
  const pressing = answers.how.some((h) => h !== 'patient');
  return answers.want.length > 0 && answers.want.every((w) => w === 'nothing') && !pressing && !(answers.notes ?? '').trim();
}

/** True when there is enough to check: something they want, or some words typed. */
export function canCheck(answers: CallAnswers): boolean {
  return answers.want.length > 0 || (answers.notes ?? '').trim().length >= 8;
}

export function describeCall(answers: CallAnswers): string {
  const lines: string[] = [];
  if (answers.who) lines.push(WHO_TEXT[answers.who]);
  const wants = answers.want.filter((w): w is Exclude<CallWant, 'nothing'> => w !== 'nothing').map((w) => WANT_TEXT[w]);
  if (wants.length > 0) lines.push(`They want me to ${wants.join(', and to ')}.`);
  else if (answers.want.includes('nothing')) lines.push('They have not asked me to do anything yet.');
  for (const how of answers.how) lines.push(HOW_TEXT[how]);
  const notes = (answers.notes ?? '').trim();
  if (notes) lines.push(`In my own words: ${notes}`);
  return lines.join(' ');
}
