/**
 * Recognising payment-card fields. Pure functions over field attributes so
 * they can be unit-tested without a browser.
 *
 * Tripwire never reads what is typed into a field it has not identified as a
 * card field, and never looks at password fields at all.
 */
import { looksLikeCardNumber } from './luhn';

export interface FieldInfo {
  type: string;
  autocomplete: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  labelText: string;
}

const CARD_AUTOCOMPLETE = /\bcc-(?:number|csc|exp|exp-month|exp-year|name|type)\b/i;
const CARD_WORDS =
  /card\s*(?:number|no\b|num\b|#)|\bcc[-_ ]?(?:num|number|no)\b|credit\s*card|debit\s*card|\bcvv2?\b|\bcvc2?\b|\bcsc\b|security\s*code|card\s*verification|cardnumber|card_number|card-number/i;
/** Fields that say "card" but are not payment cards. */
const NOT_PAYMENT = /gift|promo|coupon|voucher|loyalty|reward|library|membership|member\s*card|business\s*card|insurance|sim\b/i;
const TEXT_TYPES = new Set(['', 'text', 'tel', 'number', 'search']);

export function isCardField(info: FieldInfo): boolean {
  const type = info.type.toLowerCase();
  // Never treat a password field as anything Tripwire inspects.
  if (type === 'password' || type === 'hidden' || type === 'email') return false;
  if (!TEXT_TYPES.has(type)) return false;
  if (CARD_AUTOCOMPLETE.test(info.autocomplete)) return true;
  const hay = [info.name, info.id, info.placeholder, info.ariaLabel, info.labelText].join(' ');
  if (NOT_PAYMENT.test(hay)) return false;
  return CARD_WORDS.test(hay);
}

/** May this field's value be inspected for a typed card number? Passwords never. */
export function mayInspectValue(type: string): boolean {
  return TEXT_TYPES.has(type.toLowerCase());
}

/** True when the typed value is a complete, Luhn-valid card number. */
export function valueIsCardNumber(value: string): boolean {
  if (value.length < 13 || value.length > 23) return false;
  return looksLikeCardNumber(value);
}

/** Read the attributes of a live element. Label text is capped; nothing else on the page is touched. */
export function describeField(el: HTMLInputElement | HTMLTextAreaElement): FieldInfo {
  let labelText = '';
  try {
    const labels = 'labels' in el && el.labels ? Array.from(el.labels) : [];
    labelText = labels.map((l) => l.textContent ?? '').join(' ');
    if (!labelText) {
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        labelText = labelledBy
          .split(/\s+/)
          .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
          .join(' ');
      }
    }
  } catch {
    labelText = '';
  }
  return {
    type: el.getAttribute('type') ?? (el.tagName === 'TEXTAREA' ? 'text' : ''),
    autocomplete: el.getAttribute('autocomplete') ?? '',
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    labelText: labelText.slice(0, 120),
  };
}
