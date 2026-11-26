import { describe, expect, it } from 'vitest';
import { canCheck, describeCall } from '../src/call/describe';
import { detectShape } from '../src/inference/shape';

describe('the phone-call check by taps', () => {
  it('turns taps into a plain description', () => {
    const text = describeCall({ who: 'bank', want: ['code'], how: ['rushing', 'secret'] });
    expect(text).toContain('from my bank');
    expect(text).toContain('read them a code');
    expect(text).toContain('keep this secret');
  });

  it('joins several asks and adds what the person typed last', () => {
    const text = describeCall({ who: 'family', want: ['money', 'gift_cards'], how: [], notes: 'He says he is in jail.' });
    expect(text).toMatch(/pay a bill, a fine or a fee.* and to buy gift cards/);
    expect(text.endsWith('In my own words: He says he is in jail.')).toBe(true);
  });

  it('the description has the shape the router looks for', () => {
    const shape = detectShape(describeCall({ who: 'government', want: ['gift_cards'], how: ['rushing', 'secret'] }));
    expect(shape.moneyAsk && shape.pressure && shape.secrecy).toBe(true);
  });

  it('needs at least one ask, or some typed words, before checking', () => {
    expect(canCheck({ who: 'bank', want: [], how: ['rushing'] })).toBe(false);
    expect(canCheck({ want: ['nothing'], how: [] })).toBe(true);
    expect(canCheck({ want: [], how: [], notes: 'He wants my PIN number' })).toBe(true);
  });
});

import { nothingAskedYet, neverSafe } from '../src/call/describe';
describe('which calls need a model', () => {
  it('a calm caller who has asked for nothing needs no check', () => {
    expect(nothingAskedYet({ who: 'bank', want: ['nothing'], how: ['patient'] })).toBe(true);
    expect(nothingAskedYet({ who: 'bank', want: ['nothing'], how: ['rushing'] })).toBe(false);
    expect(nothingAskedYet({ who: 'bank', want: ['nothing'], how: [], notes: 'he wants my PIN' })).toBe(false);
  });
  it('gift cards, crypto, codes, details and computer access are never safe on a call', () => {
    for (const w of ['gift_cards', 'crypto', 'code', 'details', 'computer'] as const) expect(neverSafe({ want: [w], how: [] })).toBe(true);
    expect(neverSafe({ want: ['money'], how: [] })).toBe(false);
  });
});

describe('the "safe account" ask', () => {
  it('is never safe on a call: Hang up now at once', async () => {
    const { neverSafe } = await import('../src/call/describe');
    expect(neverSafe({ who: 'bank', want: ['safe_account'], how: [] })).toBe(true);
    expect(neverSafe({ who: 'company', want: ['money'], how: [] })).toBe(false);
  });
});
