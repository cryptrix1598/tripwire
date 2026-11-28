import { describe, expect, it } from 'vitest';
import { buysGiftCards, giftCardsInCart } from '../src/tripwires/giftPurchase';

describe('buying gift cards at a real store', () => {
  it.each([
    ['the judge\'s $800 cart', 'Checkout. Target. Cart: 4 x Google Play gift card $100. 2 x Apple Gift Card $200. Subtotal $800.00. Total $800.00. Payment. Card number.'],
    ['three Steam cards', 'Your cart Steam Wallet card $100 Qty 1 Steam Wallet card $100 Steam Wallet card $100 Subtotal $300 Checkout'],
    ['a Spanish cart', 'Carrito 2 x Tarjeta regalo Google Play 150,00 € Total 300,00 € Pagar pedido'],
  ])('asks first: %s', (_what, text) => {
    expect(buysGiftCards(text)).toBe(true);
  });
  it.each([
    ['one $25 present', 'Cart Amazon gift card $25.00 Subtotal $25.00 Place order'],
    ['a checkout with a "Have a gift card?" box', 'Checkout Wool scarf $24.00 Have a gift card? Apply it Gift cards Subtotal $24.00 Place order'],
    ['a store front, not a cart', 'Shop gift cards: Google Play $100, Apple $200, Steam $50. Browse all gift cards.'],
  ])('stays silent: %s', (_what, text) => {
    expect(buysGiftCards(text)).toBe(false);
  });
  it('adds up quantities', () => {
    expect(giftCardsInCart('Cart 4 x Google Play gift card $100 Checkout')).toBe(400);
  });
});
