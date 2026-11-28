/**
 * Buying gift cards at a real store. The store page is honest, the story is told on the phone
 * ("buy Google Play cards and read me the numbers"), so like a bank transfer the moment decides:
 * a cart that holds gift cards worth $200 or more, when the person goes to pay.
 * Decided on the device by these rules alone; nothing is sent anywhere.
 */

/** "4 x Google Play gift card $100", "Apple Gift Card ... $200", "Steam Wallet card $50". */
const GIFT_LINE =
  /(?:(\d{1,2})\s*[x×]\s*)?(?:google\s*play|apple|itunes|steam(?:\s*wallet)?|razer\s*gold|vanilla(?:\s*visa)?|ebay|amazon|target|walmart|visa|mastercard)?\s*(?:gift\s*cards?|e-?gift|wallet\s*card|prepaid\s*card|tarjetas?\s+regalo|cartes?\s+cadeaux?)[^\n$€£]{0,60}?(?:[$€£]\s?(\d{1,5}(?:[.,]\d{2})?)|(\d{1,5}(?:[.,]\d{2})?)\s?[€£$])/gi;
/** The page is a cart or a checkout, not a store front with a "Gift cards" link. */
const CART = /\b(?:cart|bag|basket|checkout|order\s*summary|subtotal|place\s*order|carrito|pedido|panier|commande)\b/i;

export const GIFT_PURCHASE_MIN = 200;

/** The total value of gift cards in the cart, or 0 when this is not a cart. */
export function giftCardsInCart(pageText: string): number {
  if (!CART.test(pageText)) return 0;
  let total = 0;
  for (const m of pageText.matchAll(GIFT_LINE)) {
    const qty = m[1] ? Number(m[1]) : 1;
    const amount = Number((m[2] ?? m[3] ?? '0').replace(',', '.'));
    if (Number.isFinite(amount)) total += qty * amount;
  }
  return Math.round(total);
}

export function buysGiftCards(pageText: string): boolean {
  return giftCardsInCart(pageText) >= GIFT_PURCHASE_MIN;
}
