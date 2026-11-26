import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScanScheduler } from '../src/content/scan';

describe('scan scheduler: knows when the page has changed and not been read again', () => {
  afterEach(() => vi.useRealTimers());

  it('is pending from a change until the scan runs, and never after stop', () => {
    vi.useFakeTimers();
    const s = createScanScheduler(() => undefined);
    expect(s.pending()).toBe(false);
    s.request();
    // A field focused now is held: the page changed and has not been judged again.
    expect(s.pending()).toBe(true);
    s.stop();
    expect(s.pending()).toBe(false);
  });
});
