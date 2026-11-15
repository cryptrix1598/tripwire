/**
 * On-device redaction by listing: the model points at personal details and the
 * replacing is done in code.
 */
import { describe, expect, it, vi } from 'vitest';
import { SCAM_SAMPLES } from '../corpus/index';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { AiEngine } from '../src/inference/engine';
import { assess } from '../src/inference/router';

const base = SCAM_SAMPLES.find((s) => s.id === 'scam-01-tech-support-popup')!.text;
const text = `${base} Ask for our senior technician Zephyrine Quillfeather at the Thornwick depot.`;
const triage = JSON.stringify({ riskScore: 55, scamType: 'tech_support', redFlags: ['It pushes you to call a number.'], confidence: 0.5 });
const cloud = JSON.stringify({ riskScore: 90, scamType: 'tech_support', redFlags: ['It pushes you to call.'], confidence: 0.9, plainEnglishExplanation: 'This is a fake warning.' });

function engine(items: unknown) {
  const analyzeInCloud = vi.fn(async (_system: string, _user: string, _model: string) => cloud);
  const e = {
    onDeviceStatus: vi.fn(async () => 'available' as const),
    triageOnDevice: vi.fn(async () => triage),
    redactOnDevice: vi.fn(async () => JSON.stringify(items)),
    analyzeInCloud,
  } satisfies AiEngine;
  return { e, analyzeInCloud };
}
const run = (e: AiEngine) => assess({ text, hostname: 'site.example', trigger: 'passive' }, { engine: e, config: { ...DEFAULT_CONFIG, maxModelChars: 6000 } });

describe('on-device redaction by listing', () => {
  it('replaces what the model points at, wherever it appears, before anything is sent', async () => {
    const { e, analyzeInCloud } = engine({ items: [{ text: 'Zephyrine Quillfeather', kind: 'NAME' }] });
    const v = await run(e);
    const sent = String(analyzeInCloud.mock.calls[0]?.[1]);
    expect(v.route).toBe('device_then_cloud');
    expect(sent).not.toContain('Zephyrine');
    expect(sent).toContain('senior technician [NAME]');
    expect(v.sentPreview).not.toContain('Quillfeather');
  });

  it('ignores answers that are not really personal details', async () => {
    const { e, analyzeInCloud } = engine({ items: [{ text: 'a', kind: 'NAME' }, { text: '[PHONE]', kind: 'PHONE' }, { text: 'not in the text at all', kind: 'ADDRESS' }, { text: 'x'.repeat(200), kind: 'NAME' }] });
    await run(e);
    const sent = String(analyzeInCloud.mock.calls[0]?.[1]);
    expect(sent).toContain('Zephyrine Quillfeather'); // the model missed it; the test shows nothing else was damaged
    expect(sent).toContain('Thornwick depot');
  });

  it('still sends (regex-redacted) text when the model gives a malformed answer', async () => {
    const { e, analyzeInCloud } = engine({ nonsense: true });
    const v = await run(e);
    expect(analyzeInCloud).toHaveBeenCalledTimes(1);
    expect(v.route).toBe('device_then_cloud');
  });
});

describe('pages that are about scams', () => {
  const article =
    'Technical support scam. A technical support scam is a type of scam in which a scammer claims to offer a legitimate technical support service. ' +
    'Victims contact scammers in a variety of ways, often through fake pop-ups. The scammer tells the victim to call a phone number immediately, ' +
    'install remote access software such as AnyDesk, and pay with gift cards. Scammers often target older victims. Report the scam to the authorities.';
  const eng = (cloudScore: number | null) => {
    const analyzeInCloud = vi.fn(async (_s: string, _u: string, _m: string) => {
      if (cloudScore === null) throw new Error('offline');
      return JSON.stringify({ riskScore: cloudScore, scamType: 'none', redFlags: [], confidence: 0.95, plainEnglishExplanation: 'This is an article about scams.' });
    });
    const e = {
      onDeviceStatus: vi.fn(async () => 'available' as const),
      triageOnDevice: vi.fn(async () => JSON.stringify({ riskScore: 90, scamType: 'tech_support', redFlags: ['It tells you to call.'], confidence: 0.9 })),
      redactOnDevice: vi.fn(async () => JSON.stringify({ items: [] })),
      analyzeInCloud,
    } satisfies AiEngine;
    return { e, analyzeInCloud };
  };
  const check = (e: AiEngine) => assess({ text: article, hostname: 'en.wikipedia.org', trigger: 'passive' }, { engine: e, config: DEFAULT_CONFIG });

  it('never pauses on the small model alone: the cloud model is asked, and its all-clear stands', async () => {
    const { e, analyzeInCloud } = eng(3);
    const v = await check(e);
    expect(analyzeInCloud).toHaveBeenCalledTimes(1);
    expect(String(analyzeInCloud.mock.calls[0]?.[1])).toContain('explaining or warning about scams');
    expect(v.state).toBe('safe');
  });

  it('stays quiet when offline rather than interrupt someone reading about scams', async () => {
    const { e } = eng(null);
    const v = await check(e);
    expect(v.state).toBe('safe');
    expect(v.bytesSentToCloud).toBe(0);
  });

  it('still pauses a real scam, which does not keep calling itself one', async () => {
    const { e, analyzeInCloud } = eng(3);
    const v = await assess({ text: base, hostname: 'site.example', trigger: 'passive' }, { engine: e, config: DEFAULT_CONFIG });
    expect(v.state).toBe('tripped');
    expect(v.route).toBe('on_device');
    expect(analyzeInCloud).not.toHaveBeenCalled();
  });
});
