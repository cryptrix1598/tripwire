/**
 * firestore.rules pins the one sentence an alert may carry for each kind of
 * scam. This keeps that list identical to the sentences the extension writes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAlert } from '../src/guardian/model';
import { PROTECTION_ACTIONS, SCAM_TYPES } from '../src/inference/schemas';

describe('security rules and alert wording stay in step', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  it('has the exact sentence for every kind of scam', () => {
    for (const type of SCAM_TYPES) {
      const sentence = buildAlert(type, 'passive', 'stopped').summary;
      expect(rules, type).toContain(`'${type}': '${sentence}'`);
    }
  });
  it('has the exact sentence for a paused transfer and for each protection change', () => {
    for (const action of ['money_transfer', ...PROTECTION_ACTIONS] as const) {
      const sentence = buildAlert('none', action, 'stopped').summary;
      expect(rules, action).toContain(`'${action}': '${sentence}'`);
    }
  });
  it('no longer accepts an arbitrary string as a summary', () => {
    expect(rules).toContain('summary == summaryFor(request.resource.data.scamType)');
    expect(rules).toContain('summary == actionSummary(request.resource.data.action)');
    expect(rules).not.toMatch(/summary is string/);
  });
});
