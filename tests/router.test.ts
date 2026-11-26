import { describe, expect, it, vi } from 'vitest';
import { BENIGN_SAMPLES, SCAM_SAMPLES } from '../corpus/index';
import { DEFAULT_CONFIG, mergeConfig } from '../src/config/defaults';
import { PrivacyInvariantError, type AiEngine, type OnDeviceStatus } from '../src/inference/engine';
import { assess, escalateForAction, extractJson } from '../src/inference/router';
import { detectSignals, worthChecking } from '../src/inference/signals';
import { regexRedact } from '../src/redaction/regex';

const SCAM = SCAM_SAMPLES.find((s) => s.id === 'scam-01-tech-support-popup')!;
const BANK_EMAIL = SCAM_SAMPLES.find((s) => s.id === 'scam-07-bank-unusual-activity')!;
const QUIET = 'Welcome to the village gardening club. We meet on the first Saturday of each month at the library.';

const triageJson = (riskScore: number, confidence = 0.9, scamType = 'tech_support') =>
  JSON.stringify({ riskScore, scamType, redFlags: ['It pushes you to call a number right now.'], confidence });
const cloudJson = (riskScore: number, confidence = 0.9, scamType = 'bank_impersonation') =>
  JSON.stringify({
    riskScore,
    scamType,
    redFlags: ['It threatens to close your account.'],
    confidence,
    plainEnglishExplanation: 'This is very likely not from your bank. Do not click or reply.',
  });

interface FakeOptions {
  status?: OnDeviceStatus;
  triage?: () => Promise<string>;
  redact?: (prompt: string) => Promise<string>;
  cloud?: (prompt: string) => Promise<string>;
}

function fakeEngine(opts: FakeOptions = {}) {
  const engine = {
    onDeviceStatus: vi.fn(async () => opts.status ?? 'available'),
    triageOnDevice: vi.fn(async (_sys: string, _user: string) => (opts.triage ?? (async () => triageJson(50)))()),
    redactOnDevice: vi.fn(async (_sys: string, user: string) =>
      (opts.redact ?? (async () => JSON.stringify({ items: [] })))(user),
    ),
    analyzeInCloud: vi.fn(async (_sys: string, user: string, _model: string) =>
      (opts.cloud ?? (async () => cloudJson(70)))(user),
    ),
  };
  return engine satisfies AiEngine;
}

const run = (text: string, engine: AiEngine, trigger: 'passive' | 'card_entry' = 'passive') =>
  assess({ text, hostname: 'site.example', trigger }, { engine, config: DEFAULT_CONFIG });

describe('router: the gate', () => {
  it('never asks a model about a page with no warning signs', async () => {
    const engine = fakeEngine();
    const v = await run(QUIET, engine);
    expect(v.state).toBe('safe');
    expect(v.route).toBe('not_checked');
    expect(engine.onDeviceStatus).not.toHaveBeenCalled();
    expect(engine.triageOnDevice).not.toHaveBeenCalled();
    expect(engine.analyzeInCloud).not.toHaveBeenCalled();
    expect(v.bytesSentToCloud).toBe(0);
  });
});

describe('router: on-device path', () => {
  it('stays silent and local when triage scores below LOW', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(10, 0.9, 'none') });
    // A page with the shape of an ask but no strong rule evidence: the small model's all-clear stands.
    const v = await run('Your order has shipped. You can pay your invoice of $40 online today or call us on 1-855-555-0100 with any questions.', engine);
    expect(v.state).toBe('safe');
    expect(v.route).toBe('on_device');
    expect(v.bytesSentToCloud).toBe(0);
    expect(engine.analyzeInCloud).not.toHaveBeenCalled();
  });

  it('TRIPS locally at HIGH with corroboration, sending nothing', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(95) });
    const v = await run(SCAM.text, engine);
    expect(v.state).toBe('tripped');
    expect(v.route).toBe('on_device');
    expect(v.bytesSentToCloud).toBe(0);
    expect(engine.redactOnDevice).not.toHaveBeenCalled();
    expect(engine.analyzeInCloud).not.toHaveBeenCalled();
  });

  it('does not trip locally when the model is unsure, even at a high score', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(95, 0.3), cloud: async () => cloudJson(40) });
    const v = await run(SCAM.text, engine);
    expect(engine.analyzeInCloud).toHaveBeenCalledTimes(1);
    expect(v.route).toBe('device_then_cloud');
    expect(v.state).toBe('caution');
  });

  it('lets a confident cloud "this is fine" overrule an unsure device model', async () => {
    // Found in the live on-device corpus run: device said 75, cloud said 0, and
    // the old 60/40 blend landed exactly on the caution line for a gift-card shop page.
    const engine = fakeEngine({ triage: async () => triageJson(75, 0.5), cloud: async () => cloudJson(0, 0.95, 'none') });
    const v = await run(SCAM.text, engine);
    expect(v.route).toBe('device_then_cloud');
    expect(v.state).toBe('safe');
    expect(v.redFlags).toEqual([]);
  });

  it('keeps the device vote when the cloud is not confident it is fine', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(75, 0.5), cloud: async () => cloudJson(10, 0.3, 'none') });
    const v = await run(SCAM.text, engine);
    expect(v.state).toBe('caution');
  });

  it('still catches a high-risk page with Wi-Fi off', async () => {
    const engine = fakeEngine({
      triage: async () => triageJson(92),
      cloud: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const v = await run(SCAM.text, engine);
    expect(v.state).toBe('tripped');
    expect(v.route).toBe('on_device');
    expect(v.bytesSentToCloud).toBe(0);
  });

  it('keeps a middle-band verdict local when the cloud is unreachable', async () => {
    const engine = fakeEngine({
      triage: async () => triageJson(55),
      cloud: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const v = await run(SCAM.text, engine);
    expect(v.state).toBe('caution');
    expect(v.route).toBe('on_device');
    expect(v.cloudUnreachable).toBe(true);
    expect(v.bytesSentToCloud).toBe(0);
  });
});

describe('router: the privacy gate before the cloud', () => {
  it('sends only redacted text for the uncertain middle band', async () => {
    let sent = '';
    const engine = fakeEngine({
      triage: async () => triageJson(55, 0.5, 'bank_impersonation'),
      cloud: async (prompt) => {
        sent = prompt;
        return cloudJson(88);
      },
    });
    const v = await run(BANK_EMAIL.text, engine);

    expect(engine.redactOnDevice).toHaveBeenCalled();
    expect(v.route).toBe('device_then_cloud');
    expect(v.redactionCount).toBeGreaterThan(0);
    expect(v.bytesSentToCloud).toBeGreaterThan(0);

    // Nothing personal from the original may appear in what was sent.
    for (const secret of ['d.whitaker@example.com', '8839201', '7730', 'session=']) {
      if (BANK_EMAIL.text.includes(secret)) expect(sent, `${secret} was sent to the cloud`).not.toContain(secret);
    }
    const body = sent.split('"""')[1]!;
    expect(regexRedact(body).total).toBe(0);
  });

  it('merges device and cloud scores and can trip on a confident cloud verdict', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(60, 0.5), cloud: async () => cloudJson(95, 0.95) });
    const v = await run(BANK_EMAIL.text, engine);
    expect(v.riskScore).toBe(Math.round(0.6 * 95 + 0.4 * 60));
    expect(v.state).toBe('tripped');
    expect(v.explanation).toContain('not from your bank');
  });

  it('lets the cloud talk the device down to safe', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(45, 0.4), cloud: async () => cloudJson(5, 0.95, 'none') });
    const v = await run(BANK_EMAIL.text, engine);
    expect(v.riskScore).toBeLessThan(DEFAULT_CONFIG.thresholds.low);
    expect(v.state).toBe('safe');
    expect(v.redFlags).toEqual([]);
  });
});

describe('router: fallback when the device has no on-device model', () => {
  it.each(['unavailable', 'downloadable', 'downloading'] as const)('status %s: regex-redacts, then cloud', async (status) => {
    let sent = '';
    const engine = fakeEngine({
      status,
      cloud: async (prompt) => {
        sent = prompt;
        return cloudJson(90);
      },
    });
    const v = await run(BANK_EMAIL.text, engine);
    expect(engine.triageOnDevice).not.toHaveBeenCalled();
    expect(engine.redactOnDevice).not.toHaveBeenCalled();
    expect(v.route).toBe('cloud_fallback');
    expect(v.state).toBe('tripped');
    expect(sent).not.toContain('d.whitaker@example.com');
    expect(regexRedact(sent.split('"""')[1]!).total).toBe(0);
  });

  it('uses built-in rules when neither model can be reached, and says so', async () => {
    const engine = fakeEngine({
      status: 'unavailable',
      cloud: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const v = await run(SCAM.text, engine);
    expect(v.route).toBe('rules_only');
    expect(v.state).toBe('caution');
    expect(v.bytesSentToCloud).toBe(0);
    expect(v.redFlags.length).toBeGreaterThan(0);
  });

  it('does not send a plain checkout page anywhere just because a card field was focused', async () => {
    const checkout = BENIGN_SAMPLES.find((s) => s.id === 'benign-07-checkout-page')!;
    const engine = fakeEngine({ status: 'unavailable' });
    const v = await assess(
      { text: checkout.text, hostname: checkout.hostname, trigger: 'card_entry' },
      { engine, config: DEFAULT_CONFIG },
    );
    expect(v.state).toBe('safe');
    expect(engine.analyzeInCloud).not.toHaveBeenCalled();
  });
});

describe('router: invalid model output fails safe', () => {
  it('retries once when the first answer is not valid JSON', async () => {
    let calls = 0;
    const engine = fakeEngine({
      triage: async () => (++calls === 1 ? 'Sure! Here is my analysis: risky.' : triageJson(95)),
    });
    const v = await run(SCAM.text, engine);
    expect(calls).toBe(2);
    expect(v.state).toBe('tripped');
  });

  it('rejects out-of-schema output (bad enum, out-of-range score)', async () => {
    const engine = fakeEngine({
      triage: async () => JSON.stringify({ riskScore: 250, scamType: 'aliens', redFlags: [], confidence: 2 }),
      cloud: async () => 'not json at all',
    });
    const v = await run(SCAM.text, engine);
    expect(engine.triageOnDevice).toHaveBeenCalledTimes(2);
    expect(v.state).toBe('caution');
    expect(v.failSafe).toBe(true);
    expect(v.route).toBe('rules_only');
  });

  it('never silently passes when every model returns garbage', async () => {
    const engine = fakeEngine({ triage: async () => '{}', cloud: async () => '[]' });
    const v = await run(BANK_EMAIL.text, engine);
    expect(v.state).not.toBe('safe');
    expect(v.failSafe).toBe(true);
  });

  it('never throws, whatever the engine does', async () => {
    const engine: AiEngine = {
      onDeviceStatus: async () => {
        throw new Error('boom');
      },
      triageOnDevice: async () => {
        throw new Error('boom');
      },
      redactOnDevice: async () => {
        throw new Error('boom');
      },
      analyzeInCloud: async () => {
        throw new Error('boom');
      },
    };
    await expect(run(SCAM.text, engine)).resolves.toMatchObject({ route: 'rules_only' });
  });

  it('times out a hung model instead of hanging the page', async () => {
    const engine = fakeEngine({ triage: () => new Promise<string>(() => {}), cloud: async () => cloudJson(85) });
    const v = await assess(
      { text: SCAM.text, hostname: 'x.example', trigger: 'passive' },
      { engine, config: DEFAULT_CONFIG, timeouts: { onDeviceMs: 30, cloudMs: 500 } },
    );
    // The device is still there, so its redaction runs before anything is sent.
    expect(v.route).toBe('device_then_cloud');
    expect(engine.redactOnDevice).toHaveBeenCalledTimes(1);
  });

  it('a hung model whose redaction also fails sends nothing', async () => {
    const engine = fakeEngine({ triage: () => new Promise<string>(() => {}), redact: async () => 'nonsense', cloud: async () => cloudJson(85) });
    const v = await assess(
      { text: SCAM.text, hostname: 'x.example', trigger: 'passive' },
      { engine, config: DEFAULT_CONFIG, timeouts: { onDeviceMs: 30, cloudMs: 500 } },
    );
    expect(engine.analyzeInCloud).not.toHaveBeenCalled();
    expect(v.bytesSentToCloud).toBe(0);
    expect(v.state).not.toBe('safe');
  });

  it('says the on-device model is still downloading instead of "not supported"', async () => {
    const engine = fakeEngine({ status: 'downloading' });
    const v = await run(BANK_EMAIL.text, engine);
    expect(v.route).toBe('cloud_fallback');
    expect(v.modelDownloading).toBe(true);
  });
});

describe('router: action tripwires', () => {
  it('trips when a card number is typed on a page the model finds suspicious', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(55, 0.5), cloud: async () => cloudJson(50, 0.6) });
    const fake = SCAM_SAMPLES.find((s) => s.id === 'scam-06-bank-lock-card-form')!;
    const v = await run(fake.text, engine, 'card_entry');
    expect(v.state).toBe('tripped');
    expect(v.trigger).toBe('card_entry');
  });

  it('checks an ordinary checkout on-device and leaves it alone', async () => {
    const checkout = BENIGN_SAMPLES.find((s) => s.id === 'benign-07-checkout-page')!;
    const engine = fakeEngine({ triage: async () => triageJson(4, 0.95, 'none') });
    const v = await run(checkout.text, engine, 'card_entry');
    expect(engine.triageOnDevice).toHaveBeenCalledTimes(1);
    expect(v.state).toBe('safe');
    expect(v.bytesSentToCloud).toBe(0);
  });

  it('escalateForAction turns an existing caution into a trip, and leaves safe pages alone', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(55, 0.5), cloud: async () => cloudJson(50, 0.6) });
    const caution = await run(SCAM.text, engine);
    expect(caution.state).toBe('caution');
    expect(escalateForAction(caution, 'remote_download', DEFAULT_CONFIG).state).toBe('tripped');

    const safe = await run(QUIET, engine);
    expect(escalateForAction(safe, 'card_entry', DEFAULT_CONFIG).state).toBe('safe');
  });
});

describe('signals: the deterministic layer', () => {
  it('passes every scam sample through the gate', () => {
    for (const s of SCAM_SAMPLES) {
      expect(worthChecking(detectSignals(s.text, DEFAULT_CONFIG)), s.id).toBe(true);
    }
  });

  it('gives no benign sample a rules-only caution', () => {
    for (const s of BENIGN_SAMPLES) {
      const { ruleScore } = detectSignals(s.text, DEFAULT_CONFIG);
      expect(ruleScore, `${s.id} scored ${ruleScore}`).toBeLessThan(DEFAULT_CONFIG.thresholds.rulesOnlyCaution);
    }
  });

  it('matches whole words only', () => {
    const s = detectSignals('The firs were tall and the officers club served subtitles.', DEFAULT_CONFIG);
    expect(s.categories).toEqual([]);
  });
});

describe('config and helpers', () => {
  it('extractJson tolerates code fences and surrounding prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
    expect(() => extractJson('no json here')).toThrow();
  });

  it('mergeConfig falls back to defaults on malformed remote values', () => {
    expect(mergeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(mergeConfig({ thresholds: { low: 'high' } })).toEqual(DEFAULT_CONFIG);
    expect(mergeConfig({ thresholds: { low: 90, high: 20 } }).thresholds).toEqual(DEFAULT_CONFIG.thresholds);
    expect(mergeConfig({ thresholds: { high: 85 }, promptVersion: 'v1' }).thresholds.high).toBe(85);
  });
});

describe('router: a phone call the person describes', () => {
  const CALL = 'He says he is from the electric company and my power will be cut off this afternoon unless I go to the store and pay him.';
  const call = (text: string, engine: AiEngine) =>
    assess({ text, hostname: 'phone call', trigger: 'phone_call', source: 'call' }, { engine, config: DEFAULT_CONFIG });

  it('always reaches the on-device model, even with no warning signs a page would need', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(10, 0.95, 'none') });
    const v = await call('Someone called about my car warranty and asked me to stay on the line.', engine);
    expect(engine.triageOnDevice).toHaveBeenCalledTimes(1);
    expect(v.route).toBe('on_device');
    expect(v.bytesSentToCloud).toBe(0);
  });

  it('tells the model it is judging a caller, not a page', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(10, 0.95, 'none') });
    await call(CALL, engine);
    const prompt = engine.triageOnDevice.mock.calls[0]![1];
    expect(prompt).toContain("the reader's own description of what the caller says");
  });

  it('with no on-device model, asks the cloud (redacted) instead of skipping the check', async () => {
    const engine = fakeEngine({ status: 'unavailable', cloud: async () => cloudJson(90, 0.9, 'other') });
    const v = await call('My grandson called, said he is in jail and needs $2,000 in gift cards, and not to tell his mom. Call 555-201-3344.', engine);
    expect(engine.analyzeInCloud).toHaveBeenCalledTimes(1);
    expect(engine.analyzeInCloud.mock.calls[0]![1]).not.toContain('555-201-3344');
    expect(v.state).toBe('tripped');
  });

  it('a page with the same quiet text is still not checked', async () => {
    const engine = fakeEngine();
    const v = await run('Someone called about my car warranty and asked me to stay on the line.', engine);
    expect(v.route).toBe('not_checked');
  });
});

describe('router: a call with an ask that is never safe', () => {
  it('is never answered "safe", even when the model says so', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(5, 0.95, 'none') });
    const v = await assess(
      { text: 'The caller says they are from my bank. They want me to read them a code that was just sent to my phone.', hostname: 'phone call', trigger: 'phone_call', source: 'call', neverSafe: true },
      { engine, config: DEFAULT_CONFIG },
    );
    expect(v.state).toBe('tripped');
    expect(v.explanation).toContain('does not ask for this on a call');
  });

  it('without that ask, a calm call can still come back safe', async () => {
    const engine = fakeEngine({ triage: async () => triageJson(5, 0.95, 'none') });
    const v = await assess(
      { text: 'The caller says they are from my bank. They have not asked me to do anything yet. They are calm and patient, and said I can call them back.', hostname: 'phone call', trigger: 'phone_call', source: 'call' },
      { engine, config: DEFAULT_CONFIG },
    );
    expect(v.state).toBe('safe');
  });
});

describe('router: no second opinion on a page full of scam words', () => {
  it('the device alone never trips a page that talks about scams while telling the reader what to do', async () => {
    const text =
      'Scam alert from the fraud team. Scammers and fraudsters target victims with phishing and scams every day. ' +
      'You must call us now at 1-855-555-0101. Pay now with gift cards so your account is protected. Do not tell anyone.';
    const engine = fakeEngine({
      triage: async () => triageJson(97, 0.95, 'bank_impersonation'),
      cloud: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const v = await run(text, engine);
    expect(v.state).not.toBe('tripped');
    expect(v.state).toBe('caution');
    expect(v.bytesSentToCloud).toBe(0);
  });
});

describe('router: a cloud check that got no usable answer is not reported as "nothing sent"', () => {
  it('an invalid cloud answer: the redacted text was sent, and the verdict says so', async () => {
    const engine = fakeEngine({ status: 'unavailable', cloud: async () => 'not json at all' });
    const v = await run(BANK_EMAIL.text, engine);
    expect(v.route).toBe('rules_only');
    expect(v.bytesSentToCloud).toBeGreaterThan(0);
    expect(v.sentPreview).toBeDefined();
    expect(v.sentPreview).not.toContain('@');
  });

  it('a cloud request that timed out after the device was unsure: counted as sent', async () => {
    const engine = fakeEngine({
      triage: async () => triageJson(55),
      cloud: async () => {
        throw new Error('cloud analysis timed out after 1ms');
      },
    });
    const v = await run(SCAM.text, engine);
    expect(v.route).toBe('on_device');
    expect(v.bytesSentToCloud).toBeGreaterThan(0);
    expect(v.sentPreview).toBeDefined();
  });

  it('offline (the request never got out): nothing is counted as sent', async () => {
    const engine = fakeEngine({
      triage: async () => triageJson(55),
      cloud: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const v = await run(SCAM.text, engine);
    expect(v.bytesSentToCloud).toBe(0);
    expect(v.sentPreview).toBeUndefined();
  });
});

describe('router: a check meant for the device that Chrome says ran in the cloud', () => {
  it('triage: stops at once, never retries, never asks the cloud, and says what happened', async () => {
    const engine = fakeEngine({
      triage: async () => {
        throw new PrivacyInvariantError('on-device triage ran in the cloud');
      },
    });
    const v = await run(SCAM.text, engine);
    expect(engine.triageOnDevice).toHaveBeenCalledTimes(1);
    expect(engine.analyzeInCloud).not.toHaveBeenCalled();
    expect(v.wrongSide).toBe(true);
    expect(v.route).toBe('rules_only');
    expect(v.state).not.toBe('safe');
  });

  it('redaction: the privacy gate closes and nothing is sent to the cloud', async () => {
    const engine = fakeEngine({
      triage: async () => triageJson(55),
      redact: async () => {
        throw new PrivacyInvariantError('on-device redaction ran in the cloud');
      },
    });
    const v = await run(SCAM.text, engine);
    expect(engine.redactOnDevice).toHaveBeenCalledTimes(1);
    expect(engine.analyzeInCloud).not.toHaveBeenCalled();
    expect(v.wrongSide).toBe(true);
    expect(v.bytesSentToCloud).toBe(0);
  });
});
