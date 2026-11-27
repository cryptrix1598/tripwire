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
      redactOnDevice: vi.fn(async () => JSON.stringify({ items: [] })),
      analyzeInCloud: vi.fn(async () => cloud),
      ...over,
    }) satisfies AiEngine;
  const run = (e: AiEngine, language?: string) => assess({ text: SCAM, hostname: 'site.example', trigger: 'passive', language }, { engine: e, config: DEFAULT_CONFIG });

  it('recognizes a non-English browser language and ignores English or nonsense', () => {
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

describe('the shape of a request (not a keyword list)', () => {
  it('lets quiet scams through to the on-device model', async () => {
    const { detectShape, worthALocalLook } = await import('../src/inference/shape');
    const holdout = JSON.parse((await import('node:fs')).readFileSync('corpus/holdout.json', 'utf8')) as { scams: Array<{ id: string; text: string }> };
    for (const sample of holdout.scams) expect(worthALocalLook(detectShape(sample.text)), sample.id).toBe(true);
  });

  it('does not wake a model for ordinary text', async () => {
    const { detectShape, worthALocalLook, worthACloudLook } = await import('../src/inference/shape');
    for (const quiet of [
      'Welcome to the village gardening club. We meet on the first Saturday of each month at the library.',
      'The council has approved plans for a new footbridge over the river. Work is expected to start in spring.',
    ]) {
      expect(worthALocalLook(detectShape(quiet))).toBe(false);
      expect(worthACloudLook(detectShape(quiet))).toBe(false);
    }
  });

  it('cuts a long page down to the sentences that carry the ask', async () => {
    const { salientExcerpt } = await import('../src/inference/shape');
    const filler = 'This paragraph is about the history of the town and has nothing to do with money. '.repeat(60);
    const ask = 'You must pay $450 today with gift cards and do not tell your family.';
    const excerpt = salientExcerpt(`Notice from the billing office. ${filler}${ask} ${filler}`, 1800);
    expect(excerpt.length).toBeLessThanOrEqual(1800);
    expect(excerpt).toContain(ask);
    expect(excerpt.startsWith('Notice from the billing office.')).toBe(true);
    expect(salientExcerpt('short text', 1800)).toBe('short text');
  });
});

describe('interface language', () => {
  it('switches the in-page copy to Spanish or French and back, leaving nothing half-translated', async () => {
    const { applyLocale } = await import('../src/ui/locale');
    const copy = await import('../src/ui/copy');
    const english = JSON.stringify([copy.BANNER, copy.INTERSTITIAL, copy.SAFE_PAGE, copy.ROUTE_BADGE]);

    expect(applyLocale('es-MX')).toBe('es');
    expect(copy.INTERSTITIAL.primary).toBe('Parar y estar a salvo');
    expect(copy.ROUTE_BADGE.on_device.label).toBe('Revisado en su computadora');
    expect(copy.ROUTE_BADGE.on_device.tone).toBe('local'); // structure untouched
    expect(copy.WHY.redactions(2)).toContain('2 datos');
    expect(copy.SAFE_PAGE.steps).toHaveLength(3);

    expect(applyLocale('fr')).toBe('fr');
    expect(copy.BANNER.why).toBe('Pourquoi ?');

    expect(applyLocale('de')).toBe('en'); // no German yet: plain English, not a mix
    expect(JSON.stringify([copy.BANNER, copy.INTERSTITIAL, copy.SAFE_PAGE, copy.ROUTE_BADGE])).toBe(english);
  });

  it('has every string in every language', async () => {
    const { ES } = await import('../src/ui/locales/es');
    const { FR } = await import('../src/ui/locales/fr');
    const copy = (await import('../src/ui/copy')) as unknown as Record<string, unknown>;
    const keys = (value: unknown, path = ''): string[] =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).flatMap(([k, v]) => keys(v, `${path}.${k}`))
        : [path];
    for (const [name, bundle] of [['es', ES], ['fr', FR]] as const) {
      for (const [group, strings] of Object.entries(bundle)) {
        const want = keys(copy[group]).filter((k) => !k.endsWith('.tone'));
        expect(keys(strings).sort(), `${name} ${group}`).toEqual(want.sort());
      }
    }
  });
});

import { applyDecision, choosePending } from '../src/guardian/model';
describe('"Yes, allow" applies only to the code on screen', () => {
  const now = 1_000_000_000;
  const links = [
    { id: 'sam', code: '111111', pairedAtMs: now - 60_000 },
    { id: 'stale', code: '222222', pairedAtMs: now - 60 * 60_000 },
    { id: 'kept', code: '333333', approved: true },
  ];
  it('approves the link made with the live code and removes other waiting links', () => {
    expect(choosePending(links, '111111', now)).toEqual({ approve: ['sam'], remove: ['stale'] });
  });
  it('after a restart, approves only a link made within one code lifetime', () => {
    expect(choosePending(links, null, now)).toEqual({ approve: ['sam'], remove: ['stale'] });
  });
  it('never touches a link the person already allowed', () => {
    const { approve, remove } = choosePending(links, '999999', now);
    expect([...approve, ...remove]).not.toContain('kept');
  });
});

describe('the answer to "someone just typed your code"', () => {
  const plan = { approve: ['sam'], remove: ['stale'] };
  it('"Yes, allow" approves the live link and removes the stale one', () => {
    expect(applyDecision(plan, true)).toEqual({ approve: ['sam'], remove: ['stale'] });
  });
  it('"No" approves nothing and removes every waiting link', () => {
    expect(applyDecision(plan, false)).toEqual({ approve: [], remove: ['sam', 'stale'] });
  });
  it('with nothing waiting, nothing changes', () => {
    expect(applyDecision({ approve: [], remove: [] }, true)).toEqual({ approve: [], remove: [] });
    expect(applyDecision({ approve: [], remove: [] }, false)).toEqual({ approve: [], remove: [] });
  });
});

describe('pairing codes', () => {
  it('are eight digits, so a live code cannot practically be guessed', async () => {
    const { generatePairingCode, PAIRING_CODE_PATTERN } = await import('../src/guardian/model');
    for (let i = 0; i < 200; i++) expect(generatePairingCode()).toMatch(PAIRING_CODE_PATTERN);
    expect(PAIRING_CODE_PATTERN.test('482913')).toBe(false);
  });
});
