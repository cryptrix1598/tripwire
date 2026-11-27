/**
 * Moving money out of a bank account: the step the costliest scams end with
 * ("your account is compromised, move your savings to a safe account"). It
 * happens on the person's REAL bank site, so the page itself shows no warning
 * signs; the risk is in the moment. Tripwire pauses a transfer only when that
 * moment looks wrong: money is going to someone new, or a scam warning or a
 * phone-call check happened on this computer within the last hour.
 *
 * Pure functions over field attributes and nearby text, so they can be tested
 * without a browser. Nothing typed into the field is read.
 */
import type { FieldInfo } from './cardField';

/** Fields that only exist to move money to someone. */
const TRANSFER_FIELD =
  /\b(?:payee|recipient|beneficiary|send(?:ing)?\s*(?:money\s*)?to|pay\s*to|transfer\s*(?:to|from|amount)|amount\s*to\s*(?:send|transfer)|routing|wire|zelle|destinatario|beneficiario|transferencia|bénéficiaire|virement)\b/i;
/** A plain "Amount" box counts only inside a form about sending money. */
const AMOUNT_FIELD = /\b(?:amount|monto|cantidad|montant)\b/i;
const TRANSFER_CONTEXT =
  /\b(?:transfer|zelle|wire|send money|move money|payee|recipient|beneficiary|routing number|transferencia|enviar dinero|virement|envoyer de l.argent)\b/i;
/** Boxes near a transfer that are not about the money: a note, an email for the receipt, a search. */
const NOT_TRANSFER = /e-?mail|message|memo|note|gift|search|coupon|promo|password|correo|courriel/i;
/** "Add a new payee", "New recipient", "first time sending". */
const NEW_PAYEE =
  /\b(?:add|new|enroll|set up)\s+(?:a\s+)?(?:new\s+)?(?:payee|recipient|beneficiary)\b|\bnew\s+(?:payee|recipient|beneficiary)\b|\bfirst time sending\b|\bnuevo destinatario\b|\bagregar (?:un )?destinatario\b|\bnouveau bénéficiaire\b|\bajouter un bénéficiaire\b/i;

/** How long a scam warning or a phone-call check counts as "just now". */
export const RECENT_RISK_MS = 60 * 60_000;

export function isTransferField(info: FieldInfo, context: string): boolean {
  const type = info.type.toLowerCase();
  if (type === 'password' || type === 'hidden' || type === 'email') return false;
  const hay = [info.name, info.id, info.placeholder, info.ariaLabel, info.labelText].join(' ');
  if (NOT_TRANSFER.test(hay)) return false;
  if (TRANSFER_FIELD.test(hay)) return true;
  return AMOUNT_FIELD.test(hay) && TRANSFER_CONTEXT.test(context);
}

/** The form is adding someone new to send money to. */
export function addsNewPayee(context: string): boolean {
  return NEW_PAYEE.test(context);
}

/** A warning or a call check happened recently enough that a transfer now fits the pattern of a scam. */
export function riskIsRecent(lastRiskAt: number | undefined, now: number): boolean {
  return typeof lastRiskAt === 'number' && now >= lastRiskAt && now - lastRiskAt <= RECENT_RISK_MS;
}

/** The text a transfer field sits in: its form, or failing that the page's title and main heading. Capped. */
export function transferContext(el: Element): string {
  const form = el.closest('form');
  const heading = el.ownerDocument.querySelector('h1, h2')?.textContent ?? '';
  return `${el.ownerDocument.title} ${heading} ${form?.textContent ?? ''}`.replace(/\s+/g, ' ').slice(0, 4000);
}
