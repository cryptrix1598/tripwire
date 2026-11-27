/**
 * The model in the transfer moment, the wider on-device look, and the cloud answer cache.
 */
import { describe, expect, it, vi } from 'vitest';
import { BENIGN_SAMPLES, SCAM_SAMPLES } from '../corpus/index';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { createCloudCache, QUOTA_REST_MS } from '../src/inference/cloudCache';
import { PrivacyInvariantError, type AiEngine, type OnDeviceStatus } from '../src/inference/engine';
import { assess, assessTransfer, TRANSFER_HOLD_SCORE, type TransferInput } from '../src/inference/router';
import { outsideTheWordLists } from '../src/inference/shape';

const triage = (riskScore: number, confidence = 0.9, scamType = 'bank_impersonation') =>
  JSON.stringify({ riskScore, scamType, redFlags: ['It says to move your savings to a safe account.'], confidence });
const cloud = (riskScore: number) =>
  JSON.stringify({ riskScore, scamType: 'bank_impersonation', redFlags: ['It threatens to close your account.'], confidence: 0.9, plainEnglishExplanation: 'This is not from your bank.' });

function engine(status: OnDeviceStatus, onDevice: () => Promise<string>, inCloud: () => Promise<string> = async () => cloud(10)) {
  return {
    onDeviceStatus: vi.fn(async () => status),
    triageOnDevice: vi.fn(async () => onDevice()),
    redactOnDevice: vi.fn(async () => JSON.stringify({ items: [] })),
    analyzeInCloud: vi.fn(async () => inCloud()),
  } satisfies AiEngine;
}

const FORM = 'Lakeside Savings Bank. Add a new payee. Payee name. Routing number. Account number. Amount. Continue';
const SAFE_ACCOUNT_FORM =
  'Add a new payee. Your account has been compromised. Move all your savings to this secure account today to protect your funds. Do not tell anyone. Payee name. Routing number. Account number. Amount.';
const transfer = (over: Partial<TransferInput> = {}): TransferInput => ({ formText: FORM, hostname: 'bank.example', newPayee: true, recentRisk: false, ...over });
const deps = (e: AiEngine) => ({ engine: e, config: DEFAULT_CONFIG });

describe('a bank transfer: how firmly to pause', () => {
  it('does not pause a known payee with nothing suspicious this hour, and asks no model', async () => {
    const e = engine('available', async () => triage(90));
    expect((await assessTransfer(transfer({ newPayee: false }), deps(e))).firmness).toBe('none');
    expect(e.triageOnDevice).not.toHaveBeenCalled();
  });

  it('holds for five minutes after a scam warning or call check in the last hour, whatever the form says', async () => {
    const e = engine('available', async () => triage(0));
    const a = await assessTransfer(transfer({ recentRisk: true }), deps(e));
    expect(a.firmness).toBe('hold');
    expect(e.triageOnDevice).not.toHaveBeenCalled();
  });

  it('asks Gemini Nano on the device about a new payee: an ordinary form gets one plain question, no hold', async () => {
    const e = engine('available', async () => triage(10, 0.9, 'none'));
    const a = await assessTransfer(transfer(), deps(e));
    expect(a).toMatchObject({ firmness: 'check', route: 'on_device', redFlags: [] });
    expect(e.triageOnDevice).toHaveBeenCalledTimes(1);
    expect(e.analyzeInCloud).not.toHaveBeenCalled();
  });

  it('holds when the model sees the story of a scam transfer, with its reasons', async () => {
    const e = engine('available', async () => triage(TRANSFER_HOLD_SCORE + 20));
    const a = await assessTransfer(transfer({ formText: SAFE_ACCOUNT_FORM }), deps(e));
    expect(a.firmness).toBe('hold');
    expect(a.route).toBe('on_device');
    expect(a.redFlags[0]).toMatch(/safe account/);
    expect(e.analyzeInCloud).not.toHaveBeenCalled();
  });

  it('a high score the model is not sure of does not hold', async () => {
    const e = engine('available', async () => triage(90, 0.3));
    expect((await assessTransfer(transfer(), deps(e))).firmness).toBe('check');
  });

  it('never sends a bank page to the cloud: without Nano the built-in rules decide', async () => {
    const plain = engine('unavailable', async () => triage(0));
    expect(await assessTransfer(transfer(), deps(plain))).toMatchObject({ firmness: 'check', route: 'rules_only' });
    const scammy = engine('unavailable', async () => triage(0));
    expect((await assessTransfer(transfer({ formText: SAFE_ACCOUNT_FORM }), deps(scammy))).firmness).toBe('hold');
    expect(plain.analyzeInCloud).not.toHaveBeenCalled();
    expect(scammy.analyzeInCloud).not.toHaveBeenCalled();
  });

  it('stops using the model if Chrome answered in the cloud', async () => {
    const e = engine('available', async () => {
      throw new PrivacyInvariantError('ran in the cloud');
    });
    const a = await assessTransfer(transfer(), deps(e));
    expect(a).toMatchObject({ firmness: 'check', route: 'rules_only', wrongSide: true });
    expect(e.triageOnDevice).toHaveBeenCalledTimes(1);
  });
});

const GERMAN =
  'Sehr geehrter Kunde, Ihr Konto wurde aus Sicherheitsgründen vorübergehend gesperrt. Bitte bestätigen Sie Ihre Identität innerhalb von 24 Stunden über den folgenden Link, sonst wird Ihr Konto dauerhaft geschlossen. Geben Sie dazu Ihre Kartennummer und die Prüfziffer ein. Mit freundlichen Grüßen, Ihr Kundendienst der Sparkasse.';

describe('the word lists are not the only gate', () => {
  it('knows which pages are written in a language the lists cover', () => {
    for (const s of [...SCAM_SAMPLES, ...BENIGN_SAMPLES]) expect(outsideTheWordLists(s.text), s.id).toBe(false);
    expect(outsideTheWordLists(GERMAN)).toBe(true);
    expect(outsideTheWordLists('您的账户已被暂时冻结。请在二十四小时内点击下面的链接确认您的身份，否则您的账户将被永久关闭。请输入您的银行卡号和密码。'.repeat(3))).toBe(true);
  });

  it('a page in another language gets an on-device look, and may warn only when the model is sure', async () => {
    const sure = engine('available', async () => triage(92, 0.9));
    const v = await assess({ text: GERMAN, hostname: 'konto.example', trigger: 'passive' }, deps(sure));
    expect(v.state).toBe('caution');
    expect(v.route).toBe('on_device');
    expect(sure.analyzeInCloud).not.toHaveBeenCalled();

    const unsure = engine('available', async () => triage(65, 0.9));
    expect((await assess({ text: GERMAN, hostname: 'konto.example', trigger: 'passive' }, deps(unsure))).state).toBe('safe');
  });

  it('without the on-device model such a page is not sent anywhere', async () => {
    const e = engine('unavailable', async () => triage(92));
    const v = await assess({ text: GERMAN, hostname: 'konto.example', trigger: 'passive' }, deps(e));
    expect(v.route).toBe('not_checked');
    expect(e.analyzeInCloud).not.toHaveBeenCalled();
  });

  it('a page with a password or card box and one warning sign gets the same look', async () => {
    const text = 'Sign in to keep your account active. Enter your password below to continue using your mailbox.';
    const e = engine('available', async () => triage(10, 0.9, 'none'));
    await assess({ text, hostname: 'mail.example', trigger: 'passive', secretField: true }, deps(e));
    expect(e.triageOnDevice).toHaveBeenCalledTimes(1);
    const none = engine('available', async () => triage(10));
    await assess({ text: 'Welcome to the village gardening club. We meet on Saturdays.', hostname: 'club.example', trigger: 'passive', secretField: true }, deps(none));
    expect(none.triageOnDevice).not.toHaveBeenCalled();
  });
});

const SCAM_TEXT = SCAM_SAMPLES.find((s) => s.id === 'scam-07-bank-unusual-activity')!.text;

describe('the cloud path under load', () => {
  it('sends the same redacted request only once in half an hour', async () => {
    const e = engine('unavailable', async () => '', async () => cloud(85));
    const cloudCache = createCloudCache();
    const first = await assess({ text: SCAM_TEXT, hostname: 'bank.example', trigger: 'passive' }, { ...deps(e), cloudCache });
    const second = await assess({ text: SCAM_TEXT, hostname: 'bank.example', trigger: 'passive' }, { ...deps(e), cloudCache });
    expect(e.analyzeInCloud).toHaveBeenCalledTimes(1);
    expect(second.state).toBe(first.state);
    expect(second.route).toBe('cloud_fallback');
  });

  it('after "over quota" it rests for a minute: the rules decide at once and nothing is sent', async () => {
    let now = 1_000_000;
    const cloudCache = createCloudCache(() => now);
    const e = engine('unavailable', async () => '', async () => {
      throw new Error('429 RESOURCE_EXHAUSTED');
    });
    const fast = { ...deps(e), cloudCache, cloudBackoffMs: 0 };
    const first = await assess({ text: SCAM_TEXT, hostname: 'bank.example', trigger: 'passive' }, fast);
    expect(first.cloudFailure).toBe('quota');
    const calls = e.analyzeInCloud.mock.calls.length;
    const resting = await assess({ text: `${SCAM_TEXT} (again)`, hostname: 'bank.example', trigger: 'passive' }, fast);
    expect(e.analyzeInCloud.mock.calls.length).toBe(calls);
    expect(resting.cloudFailure).toBe('quota');
    expect(resting.bytesSentToCloud).toBe(0);
    expect(resting.state).not.toBe('safe');
    now += QUOTA_REST_MS + 1;
    await assess({ text: `${SCAM_TEXT} (later)`, hostname: 'bank.example', trigger: 'passive' }, fast);
    expect(e.analyzeInCloud.mock.calls.length).toBeGreaterThan(calls);
  });
});
