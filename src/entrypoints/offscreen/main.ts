/**
 * Offscreen document: Tripwire's AI host.
 *
 * It exists because Chrome's Prompt API (and therefore on-device inference
 * through Firebase AI Logic) needs a document, and the MV3 service worker is
 * not one. It also hosts the rest of the Firebase SDK: Remote Config, anonymous
 * Auth and the Firestore writes for Family Guardian.
 */
import { applySensitivity, loadSettings } from '../../config/settings';
import { loadConfig } from '../../config/store';
import { refreshRemoteConfig } from '../../config/remoteConfig';
import { isFirebaseConfigured } from '../../firebase/config';
import {
  createPairingCode,
  decidePending,
  disconnectGuardians,
  endHold,
  familyDecision,
  guardianCount,
  guardianLinks,
  retirePairingCode,
  sendAlert,
  sendHeartbeat,
  startHold,
} from '../../guardian/device';
import { withTimeout } from '../../inference/engine';
import type { AiEngine } from '../../inference/engine';
import { firebaseEngine, onDeviceStatus } from '../../inference/firebaseEngine';
import { createCloudCache } from '../../inference/cloudCache';
import { assess, assessTransfer } from '../../inference/router';
import type { PairingReply, StatusReply, ToOffscreen } from '../../messaging';
import { applyLocale } from '../../ui/locale';

/** With no Firebase project configured the extension still protects, on built-in rules only. */
const unconfiguredEngine: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: () => Promise.reject(new Error('Firebase not configured')),
  redactOnDevice: () => Promise.reject(new Error('Firebase not configured')),
  analyzeInCloud: () => Promise.reject(new Error('Firebase not configured')),
};

const engine: AiEngine = isFirebaseConfigured() ? firebaseEngine : unconfiguredEngine;
/** Lives as long as this document: remembered cloud answers, in memory only. */
const cloudCache = createCloudCache();
try {
  applyLocale(chrome.i18n.getUILanguage());
} catch {
  // English.
}
let configSource: 'remote' | 'default' = 'default';

async function refreshConfig(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    configSource = (await refreshRemoteConfig()).source;
  } catch {
    // Offline or Remote Config not set up: local defaults stay in force.
  }
}

/**
 * Gemini Nano runs one prompt at a time. Checks from several tabs are queued here, so they
 * do not run at once and time out (the router's timeouts start when a check leaves the queue).
 */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function status(): Promise<StatusReply> {
  const config = await loadConfig();
  let count = 0;
  let pending = 0;
  let pendingNames: string[] = [];
  let guardianReady = false;
  if (isFirebaseConfigured() && navigator.onLine) {
    try {
      ({ approved: count, pending, pendingNames } = await guardianLinks());
      guardianReady = true;
    } catch {
      guardianReady = false;
    }
  }
  return {
    firebaseConfigured: isFirebaseConfigured(),
    onDevice: isFirebaseConfigured() ? await onDeviceStatus() : 'unavailable',
    promptApiInOffscreen: typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== 'undefined',
    guardianReady,
    guardianCount: count,
    pendingGuardians: pending,
    pendingNames,
    configSource,
    promptVersion: config.promptVersion,
    thresholds: config.thresholds,
  };
}

async function pairing(): Promise<PairingReply> {
  if (!isFirebaseConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const { code, expiresAt } = await createPairingCode();
    return { ok: true, code, expiresAt };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

async function handle(msg: ToOffscreen): Promise<unknown> {
  switch (msg.type) {
    case 'assess': {
      const config = applySensitivity(await loadConfig(), (await loadSettings()).sensitivity);
      return oneAtATime(() => assess(msg.input, { engine, config, cloudCache }));
    }
    case 'assess-transfer': {
      const config = applySensitivity(await loadConfig(), (await loadSettings()).sensitivity);
      return oneAtATime(() => assessTransfer(msg.input, { engine, config }));
    }
    case 'status':
      return status();
    case 'pairing-code':
      return pairing();
    case 'pairing-decide':
      if (!isFirebaseConfigured()) return { ok: false };
      try {
        await decidePending(msg.allow);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    case 'pairing-finish':
      if (isFirebaseConfigured()) await retirePairingCode();
      return { ok: true };
    case 'family-disconnect':
      if (!isFirebaseConfigured()) return { ok: false };
      try {
        await disconnectGuardians();
        return { ok: true };
      } catch {
        return { ok: false };
      }
    case 'alert':
      if (!isFirebaseConfigured()) return { ok: false };
      try {
        // Only send when someone is actually paired.
        if ((await guardianCount()) > 0) await sendAlert(msg.scamType, msg.trigger, msg.outcome);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    case 'heartbeat':
      if (!isFirebaseConfigured()) return { ok: false };
      try {
        // Only for a computer someone looks out for.
        if ((await guardianCount()) > 0) await sendHeartbeat();
        return { ok: true };
      } catch {
        return { ok: false };
      }
    case 'hold-start':
      // Tell the family only when someone is paired; the clock never waits for this.
      if (!isFirebaseConfigured()) return { told: false };
      try {
        if ((await withTimeout(guardianCount(), 8000, 'guardians')) === 0) return { told: false };
        await withTimeout(startHold(msg.action, msg.endsAt), 8000, 'hold start');
        return { told: true };
      } catch {
        return { told: false };
      }
    case 'hold-check':
      if (!isFirebaseConfigured()) return { decision: null };
      try {
        return { decision: await withTimeout(familyDecision(), 4000, 'hold check') };
      } catch {
        return { decision: null };
      }
    case 'hold-end':
      if (isFirebaseConfigured()) await withTimeout(endHold(), 8000, 'hold end').catch(() => undefined);
      return { ok: true };
    case 'refresh-config':
      await refreshConfig();
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((msg: ToOffscreen, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  handle(msg)
    .then((reply) => sendResponse(reply ?? { ok: true }))
    .catch((err) => sendResponse({ __error: String(err) }));
  return true;
});

void refreshConfig();
