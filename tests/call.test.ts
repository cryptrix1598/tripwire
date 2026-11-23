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
    expect(text).toMatch(/pay money .* and to buy gift cards/);
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
