import { describe, expect, it } from 'vitest';
import { CLOUD_POLICY, decide, GATE_POLICY, MODEL_POLICY, POLICY, TRIAGE_POLICY, type TriageFacts } from '../src/inference/policy';
import { DECISION_STEPS } from '../src/inference/schemas';

const triage = (f: Partial<TriageFacts>): TriageFacts => ({
  wideLook: false,
  answered: true,
  wrongSide: false,
  cloudLook: true,
  wideSure: false,
  deviceSaysSafe: false,
  overruled: false,
  confirmed: false,
  ...f,
});

describe('the policy tables', () => {
  it('every row says why, and every table says what happens otherwise', () => {
    for (const table of Object.values(POLICY)) {
      expect(table.otherwiseWhy.length).toBeGreaterThan(10);
      for (const row of table.rows) expect(row.why.length).toBeGreaterThan(10);
    }
  });

  it('before any model', () => {
    const f = { passive: true, localLook: false, wideLook: false, asked: false, nothingAskedYet: false, neverSafe: false };
    expect(decide(GATE_POLICY, f)).toBe('gate');
    expect(decide(GATE_POLICY, { ...f, localLook: true })).toBe('go_on');
    expect(decide(GATE_POLICY, { ...f, passive: false, asked: true, nothingAskedYet: true })).toBe('nothing_asked');
    expect(decide(GATE_POLICY, { ...f, passive: false, asked: true, nothingAskedYet: true, neverSafe: true })).toBe('go_on');
  });

  it('which model may look', () => {
    expect(decide(MODEL_POLICY, { wideLook: true, deviceReady: false, cloudLook: true })).toBe('not_checked');
    expect(decide(MODEL_POLICY, { wideLook: false, deviceReady: false, cloudLook: false })).toBe('not_checked');
    expect(decide(MODEL_POLICY, { wideLook: false, deviceReady: false, cloudLook: true })).toBe('cloud_only');
    expect(decide(MODEL_POLICY, { wideLook: true, deviceReady: true, cloudLook: false })).toBe('device');
  });

  it('after the on-device look, first match wins', () => {
    expect(decide(TRIAGE_POLICY, triage({ wideLook: true, answered: false, wrongSide: true }))).toBe('not_checked');
    expect(decide(TRIAGE_POLICY, triage({ wideLook: true }))).toBe('wide_unsure');
    expect(decide(TRIAGE_POLICY, triage({ wideLook: true, wideSure: true, confirmed: true }))).toBe('wide_sure');
    expect(decide(TRIAGE_POLICY, triage({ answered: false, wrongSide: true }))).toBe('rules_wrong_side');
    expect(decide(TRIAGE_POLICY, triage({ answered: false, cloudLook: false }))).toBe('rules');
    expect(decide(TRIAGE_POLICY, triage({ answered: false }))).toBe('cloud_after_failure');
    expect(decide(TRIAGE_POLICY, triage({ deviceSaysSafe: true }))).toBe('device_safe');
    expect(decide(TRIAGE_POLICY, triage({ deviceSaysSafe: true, overruled: true }))).toBe('ask_cloud');
    expect(decide(TRIAGE_POLICY, triage({ confirmed: true }))).toBe('device_confirmed');
    expect(decide(TRIAGE_POLICY, triage({}))).toBe('ask_cloud');
  });

  it('after the cloud', () => {
    expect(decide(CLOUD_POLICY, { answered: true, aboutScamsPassive: true, deviceSaidSafe: true })).toBe('device_then_cloud');
    expect(decide(CLOUD_POLICY, { answered: false, aboutScamsPassive: true, deviceSaidSafe: true })).toBe('about_scams');
    expect(decide(CLOUD_POLICY, { answered: false, aboutScamsPassive: false, deviceSaidSafe: true })).toBe('rules_overruled');
    expect(decide(CLOUD_POLICY, { answered: false, aboutScamsPassive: false, deviceSaidSafe: false })).toBe('device_alone');
  });

  it('every final step is one the verdict can name', () => {
    const finals = [GATE_POLICY.rows, MODEL_POLICY.rows, TRIAGE_POLICY.rows, CLOUD_POLICY.rows].flat().map((r) => r.then).concat(CLOUD_POLICY.otherwise);
    const inner = new Set(['go_on', 'device', 'ask_cloud', 'cloud_only', 'rules_wrong_side', 'cloud_after_failure']);
    for (const step of finals) if (!inner.has(step)) expect(DECISION_STEPS).toContain(step);
  });
});
