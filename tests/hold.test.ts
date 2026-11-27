import { describe, expect, it } from 'vitest';
import { HOLD_MS, HOLD_TRIGGERS, clock, nextHoldEnd } from '../src/ui/hold';

describe('the five-minute hold', () => {
  it('holds only the asks that are never safe', () => {
    expect([...HOLD_TRIGGERS].sort()).toEqual(['crypto_wire', 'gift_card', 'remote_download']);
  });
  it('starts at five minutes, and reopening the page neither restarts nor skips it', () => {
    const first = nextHoldEnd(undefined, 1_000, false);
    expect(first).toBe(1_000 + HOLD_MS);
    expect(nextHoldEnd(first, 60_000, false)).toBe(first);
  });
  it('"wait longer" only ever adds time', () => {
    const end = 1_000 + HOLD_MS;
    expect(nextHoldEnd(end, 2_000, true)).toBe(end + HOLD_MS);
    // after it ran out, waiting longer starts from now
    expect(nextHoldEnd(end, end + 10_000, true)).toBe(end + 10_000 + HOLD_MS);
  });
  it('shows minutes and seconds', () => {
    expect(clock(HOLD_MS)).toBe('5:00');
    expect(clock(61_500)).toBe('1:02');
    expect(clock(-5)).toBe('0:00');
  });
});
