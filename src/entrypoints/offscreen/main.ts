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
import { createPairingCode, guardianCount, sendAlert } from '../../guardian/device';
import type { AiEngine } from '../../inference/engine';
import { firebaseEngine, onDeviceStatus } from '../../inference/firebaseEngine';
import { assess } from '../../inference/router';
import type { PairingReply, StatusReply, ToOffscreen } from '../../messaging';

/** With no Firebase project configured the extension still protects, on built-in rules only. */
const unconfiguredEngine: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: () => Promise.reject(new Error('Firebase not configured')),
  redactOnDevice: () => Promise.reject(new Error('Firebase not configured')),
  analyzeInCloud: () => Promise.reject(new Error('Firebase not configured')),
};

const engine: AiEngine = isFirebaseConfigured() ? firebaseEngine : unconfiguredEngine;
let configSource: 'remote' | 'default' = 'default';

async function refreshConfig(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    configSource = (await refreshRemoteConfig()).source;
  } catch {
    // Offline or Remote Config not set up: local defaults stay in force.
  }
}

async function status(): Promise<StatusReply> {
  const config = await loadConfig();
  let count = 0;
  let guardianReady = false;
  if (isFirebaseConfigured() && navigator.onLine) {
    try {
      count = await guardianCount();
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
    case 'assess':
      return assess(msg.input, { engine, config: applySensitivity(await loadConfig(), (await loadSettings()).sensitivity) });
    case 'status':
      return status();
    case 'pairing-code':
      return pairing();
    case 'alert':
      if (!isFirebaseConfigured()) return { ok: false };
      try {
        // Only send when someone is actually paired.
        if ((await guardianCount()) > 0) await sendAlert(msg.scamType, msg.trigger, msg.outcome);
        return { ok: true };
      } catch {
        return { ok: false };
      }
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
