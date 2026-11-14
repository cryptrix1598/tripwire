/**
 * Prompts for the three model calls. Versioned so Remote Config can tell the
 * extension which revision to use and so eval results can be compared.
 *
 * The on-device prompts are short on purpose: Gemini Nano has a small context
 * window and does best with direct instructions and a tight schema.
 */
import type { Trigger, Triage } from './schemas';

export const PROMPT_VERSIONS = ['v1'] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];

interface PromptSet {
  triageSystem: string;
  redactSystem: string;
  cloudSystem: string;
}

const SCAM_TYPES_HELP =
  'scamType must be one of: none, tech_support, gift_card, bank_impersonation, government_impersonation, delivery, shopping_impersonation, investment_crypto, prize_lottery, romance, payment_request, phishing_login, other.';

const V1: PromptSet = {
  triageSystem: [
    'You screen web pages and emails for scams to protect an older adult.',
    'A scam tries to make the reader ACT: pay, type card or bank details, buy gift cards, install remote-access software, call a phone number, or send crypto or a wire.',
    'Score how likely the text is a scam, from 0 (clearly legitimate) to 100 (clearly a scam).',
    'These are NOT scams and must score under 20: ordinary notices from real companies that do not pressure the reader; receipts and shipping updates with no fee demanded; normal checkout pages; articles or bank pages that WARN people about scams.',
    'These are strong scam signs: payment by gift card; a stranger asking for remote access; threats with a deadline; a fee to release a package or prize; guaranteed investment returns; being told to keep it secret or stay on the line.',
    SCAM_TYPES_HELP,
    'redFlags: up to 4 short plain sentences a grandparent would understand, each naming one sign and starting with "It", for example "It asks you to pay with gift cards." or "It tells you not to talk to your own bank." Use everyday words only: never say victim, urgency, isolate, security risk, phishing or malware. Do not copy names, numbers or addresses from the text.',
    'confidence: 0 to 1, how sure you are of the score.',
    'Reply with JSON only.',
  ].join('\n'),

  redactSystem: [
    'You remove personal details from text. Copy the text exactly, but replace every personal detail with a tag.',
    'Use [NAME] for any person\'s name, [ADDRESS] for any street or mailing address, [EMAIL], [PHONE], [ACCOUNT] for account or member numbers, [CARD] for card numbers, [DOB] for birth dates.',
    'Keep every tag that is already in the text. Keep company names, amounts of money and all other words unchanged.',
    'Do not summarise. Do not add anything. Do not explain.',
    'Reply with JSON only: {"redactedText": "..."}',
  ].join('\n'),

  cloudSystem: [
    'You are a scam analyst helping protect an older adult. You receive text from a web page or email. Personal details have already been replaced with tags such as [NAME], [PHONE], [EMAIL], [CARD], [ACCOUNT], [ADDRESS], [LINK]. Never try to guess what a tag stood for.',
    'Decide how likely the text is a scam that tries to make the reader act: pay, share card or bank details, buy gift cards, install remote-access software, call a number, or send crypto or a wire.',
    'riskScore: 0 (clearly legitimate) to 100 (clearly a scam). Be decisive.',
    'Score under 20 for: ordinary notices from real companies that apply no pressure and demand nothing unusual; receipts; shipping updates with no fee; normal checkout pages; content that educates people about scams.',
    'Score over 80 for: gift cards as payment; requests for remote access; threats with deadlines tied to payment or credentials; fees to release packages, prizes or refunds; guaranteed returns; instructions to keep it secret.',
    'A site name that imitates a well-known brand with a different or misspelled domain is a strong sign.',
    SCAM_TYPES_HELP,
    'redFlags: up to 4 short plain sentences for a grandparent. No jargon: never say phishing, malware, spoofing or social engineering. Each names one sign.',
    'plainEnglishExplanation: one or two calm, kind sentences saying what this is and what to do. No jargon. No tags.',
    'confidence: 0 to 1.',
    'Reply with JSON only.',
  ].join('\n'),
};

const SETS: Record<PromptVersion, PromptSet> = { v1: V1 };

export function promptSet(version: string): PromptSet {
  return SETS[(PROMPT_VERSIONS as readonly string[]).includes(version) ? (version as PromptVersion) : 'v1'];
}

const TRIGGER_CONTEXT: Record<Trigger, string> = {
  passive: 'The reader has just opened this.',
  card_entry: 'The reader is about to type a payment card number on this page.',
  remote_download: 'The reader is about to download remote-access software after viewing this page.',
  phone_call: 'The reader is being urged to call a phone number shown here.',
  gift_card: 'The reader is being asked to buy gift cards.',
  crypto_wire: 'The reader is being asked to send crypto or a wire transfer.',
};

export interface PromptContext {
  /** Site host only, such as "example.com". Never a full URL. */
  hostname: string;
  trigger: Trigger;
  /** PII-free list of rule categories that matched. */
  signalSummary: string;
}

export function buildTriagePrompt(text: string, ctx: PromptContext): string {
  return [
    `Site: ${ctx.hostname || 'unknown'}`,
    `Situation: ${TRIGGER_CONTEXT[ctx.trigger]}`,
    `Warning signs matched by simple rules: ${ctx.signalSummary}`,
    'Text:',
    '"""',
    text,
    '"""',
  ].join('\n');
}

export function buildRedactPrompt(preRedacted: string): string {
  return ['Text:', '"""', preRedacted, '"""'].join('\n');
}

export function buildCloudPrompt(redactedText: string, ctx: PromptContext, deviceTriage?: Triage | null): string {
  const lines = [
    `Site: ${ctx.hostname || 'unknown'}`,
    `Situation: ${TRIGGER_CONTEXT[ctx.trigger]}`,
    `Warning signs matched by simple rules: ${ctx.signalSummary}`,
  ];
  if (deviceTriage) {
    lines.push(
      `A small on-device model scored this ${deviceTriage.riskScore}/100 (type: ${deviceTriage.scamType}) and was unsure. Give your own independent judgement.`,
    );
  }
  lines.push('Text (personal details already removed):', '"""', redactedText, '"""');
  return lines.join('\n');
}
