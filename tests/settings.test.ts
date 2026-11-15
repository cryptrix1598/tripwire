import { describe, expect, it, vi } from 'vitest';
import { SCAM_SAMPLES } from '../corpus/index';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { applySensitivity, isTrusted, normalizeSite } from '../src/config/settings';
import type { AiEngine } from '../src/inference/engine';
import { explainLanguage } from '../src/inference/prompts';
import { assess } from '../src/inference/router';

describe('trusted sites', () => {
  it('reduces what someone types to a bare site name', () => {
    expect(normalizeSite('https://www.MyBank.com/login?next=1')).toBe('mybank.com');
    expect(normalizeSite('  mybank.com  ')).toBe('mybank.com');
    expect(normalizeSite('mail.example.co.uk:8443/inbox')).toBe('mail.example.co.uk');
  });

  it('refuses anything that is not one site', () => {
    for (const bad of ['', 'not a site', 'com', 'co.uk', 'com.au', 'http://', '*.com', 'my bank.com', '192.168.1.1']) {
      expect(normalizeSite(bad)).toBeNull();
    }
  });

  it('covers the site and its subdomains, never a look-alike', () => {
    const sites = ['mybank.com'];
    expect(isTrusted('mybank.com', sites)).toBe(true);
    expect(isTrusted('www.mybank.com', sites)).toBe(true);
    expect(isTrusted('secure.mybank.com', sites)).toBe(true);
    expect(isTrusted('mybank.com.evil.example', sites)).toBe(false);
    expect(isTrusted('notmybank.com', sites)).toBe(false);
    expect(isTrusted('mybank.co', sites)).toBe(false);
  });
});

describe('warning level', () => {
  it('leaves the tested thresholds alone on "standard"', () => {
    expect(applySensitivity(DEFAULT_CONFIG, 'standard')).toBe(DEFAULT_CONFIG);
  });

  it('moves thresholds down for "more careful" and up for "fewer warnings", keeping them ordered', () => {
    const more = applySensitivity(DEFAULT_CONFIG, 'more').thresholds;
    const fewer = applySensitivity(DEFAULT_CONFIG, 'fewer').thresholds;
    const base = DEFAULT_CONFIG.thresholds;
    expect(more.low).toBeLessThan(base.low);
    expect(fewer.low).toBeGreaterThan(base.low);
    for (const t of [more, fewer]) {
      expect(t.low).toBeLessThan(t.high);
      expect(t.rulesOnlyCaution).toBeGreaterThanOrEqual(t.low);
      expect(t.high).toBeLessThanOrEqual(95);
    }
  });
});

describe('explanations in the browser language', () => {
  const SCAM = SCAM_SAMPLES.find((s) => s.id === 'scam-01-tech-support-popup')!.text;
  const triage = (score: number, confidence = 0.9) =>
    JSON.stringify({ riskScore: score, scamType: 'tech_support', redFlags: ['It threatens to close your account.'], confidence });
  const cloud = JSON.stringify({
    riskScore: 90, scamType: 'bank_impersonation', redFlags: ['Amenaza con cerrar su cuenta.'], confidence: 0.9,
    plainEnglishExplanation: 'Es muy probable que esto no sea de su banco.',
  });
  const engine = (over: Partial<AiEngine> = {}) =>
    ({
      onDeviceStatus: vi.fn(async () => 'available' as const),
      triageOnDevice: vi.fn(async () => triage(95)),
      redactOnDevice: vi.fn(async (_s: string, user: string) => JSON.stringify({ redactedText: user.split('"""')[1]!.trim() })),
      analyzeInCloud: vi.fn(async () => cloud),
      ...over,
    }) satisfies AiEngine;
  const run = (e: AiEngine, language?: string) => assess({ text: SCAM, hostname: 'site.example', trigger: 'passive', language }, { engine: e, config: DEFAULT_CONFIG });

  it('recognises a non-English browser language and ignores English or nonsense', () => {
    expect(explainLanguage('es-ES')).toEqual({ code: 'es', name: 'Spanish' });
    expect(explainLanguage('en-GB')).toBeNull();
    expect(explainLanguage(undefined)).toBeNull();
    expect(explainLanguage('zz-!!')).toBeNull();
  });

  it('translates a local verdict on the device, so nothing is sent', async () => {
    const translateOnDevice = vi.fn(async () => JSON.stringify({ texts: ['Su computadora reconoció esto como una estafa.', 'Amenaza con cerrar su cuenta.'] }));
    const e = engine({ translateOnDevice });
    const v = await run(e, 'es-ES');
    expect(v.route).toBe('on_device');
    expect(v.bytesSentToCloud).toBe(0);
    expect(e.analyzeInCloud).not.toHaveBeenCalled();
    expect(translateOnDevice).toHaveBeenCalledTimes(1);
    expect(v.explanationLanguage).toBe('es');
    expect(v.redFlags).toEqual(['Amenaza con cerrar su cuenta.']);
  });

  it('keeps the English reasons when the device cannot write that language, and still sends nothing', async () => {
    const e = engine({ translateOnDevice: vi.fn(async () => Promise.reject(new Error('language not supported'))) });
    const v = await run(e, 'sw');
    expect(v.state).toBe('tripped');
    expect(v.bytesSentToCloud).toBe(0);
    expect(v.explanationLanguage).toBeUndefined();
    expect(v.redFlags).toEqual(['It threatens to close your account.']);
  });

  it('asks the cloud model to write in that language when the cloud is used anyway', async () => {
    const analyzeInCloud = vi.fn(async (_system: string, _user: string, _model: string) => cloud);
    const e = engine({ triageOnDevice: vi.fn(async () => triage(55, 0.5)), analyzeInCloud });
    const v = await run(e, 'es');
    expect(v.route).toBe('device_then_cloud');
    expect(analyzeInCloud.mock.calls[0]?.[1]).toContain('in Spanish (es)');
    expect(v.explanationLanguage).toBe('es');
    expect(v.redFlags).toEqual(['Amenaza con cerrar su cuenta.']);
  });

  it('changes nothing for an English browser', async () => {
    const translateOnDevice = vi.fn(async () => '{}');
    const v = await run(engine({ translateOnDevice }), 'en-US');
    expect(translateOnDevice).not.toHaveBeenCalled();
    expect(v.explanationLanguage).toBeUndefined();
  });
});
