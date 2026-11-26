/**
 * Typed messages between the content script, the service worker, the offscreen
 * document and extension pages. Every message names its `target`, because
 * chrome.runtime.sendMessage is delivered to every extension context.
 */
import type { TripwireConfig } from './config/defaults';
import type { OnDeviceStatus } from './inference/engine';
import type { AssessInput } from './inference/router';
import type { ScamType, Trigger, Verdict } from './inference/schemas';
import type { Outcome } from './ui/copy';

/* ---------- content script / pages → service worker ---------- */

export type ToBackground =
  // `page` identifies the exact page (origin + path + hash, never the query) so that
  // "I'm sure, continue" applies to that page only, not the whole site. It stays in session memory.
  | { target: 'background'; type: 'assess'; input: AssessInput; page?: string }
  | { target: 'background'; type: 'outcome'; scamType: ScamType; trigger: Trigger; outcome: Outcome; hostname: string; page?: string; downloadId?: number }
  | { target: 'background'; type: 'leave' }
  // The page keeps removing the warning: show the pause on an extension page instead.
  | { target: 'background'; type: 'takeover'; verdict: Verdict; page: string; hostname: string }
  | { target: 'background'; type: 'frame-card-intent' }
  | { target: 'background'; type: 'get-tab-state'; tabId: number }
  | { target: 'background'; type: 'get-status' }
  | { target: 'background'; type: 'pairing-code' }
  | { target: 'background'; type: 'pairing-finish' }
  | { target: 'background'; type: 'pairing-decide'; allow: boolean }
  | { target: 'background'; type: 'family-disconnect' }
  | { target: 'background'; type: 'get-pending-download'; downloadId: number };

/* ---------- service worker → offscreen document ---------- */

export type ToOffscreen =
  | { target: 'offscreen'; type: 'assess'; input: AssessInput }
  | { target: 'offscreen'; type: 'status' }
  | { target: 'offscreen'; type: 'pairing-code' }
  | { target: 'offscreen'; type: 'pairing-finish' }
  | { target: 'offscreen'; type: 'pairing-decide'; allow: boolean }
  | { target: 'offscreen'; type: 'family-disconnect' }
  | { target: 'offscreen'; type: 'alert'; scamType: ScamType; trigger: Trigger; outcome: Outcome }
  | { target: 'offscreen'; type: 'refresh-config' };

/* ---------- service worker → content script (top frame) ---------- */

export type ToContent = { target: 'content'; type: 'card-intent-in-frame' };

/* ---------- replies ---------- */

export interface AssessReply {
  verdict: Verdict;
  /** True when the person already chose "I'm sure, continue" on this site in this tab. */
  acknowledged: boolean;
}

export interface StatusReply {
  firebaseConfigured: boolean;
  onDevice: OnDeviceStatus;
  /** Whether Chrome exposes the Prompt API (LanguageModel) inside the offscreen document at all. */
  promptApiInOffscreen: boolean;
  /** Signed in and able to reach Firestore. */
  guardianReady: boolean;
  guardianCount: number;
  /** Someone typed the code and is waiting for the person's "Yes, allow". */
  pendingGuardians: number;
  configSource: 'remote' | 'default';
  promptVersion: string;
  thresholds: TripwireConfig['thresholds'];
}

export interface TabStateReply {
  verdict: Verdict | null;
  hostname: string | null;
  /** The person marked this site as trusted, so Tripwire did not check it. */
  trusted: boolean;
}

export type PairingReply = { ok: true; code: string; expiresAt: number } | { ok: false; reason: 'not_configured' | 'offline' };

export interface PendingDownloadReply {
  verdict: Verdict | null;
  filename: string;
  /** Set when the pause was moved off a page that kept removing it. */
  page?: string;
  hostname?: string;
  /** The remote-access tool, so "continue" can be remembered for it. */
  tool?: string;
}

/** Send a message and resolve to null instead of throwing if nothing answers. */
export async function send<T>(message: ToBackground | ToOffscreen): Promise<T | null> {
  try {
    const reply = (await chrome.runtime.sendMessage(message)) as T | { __error: string } | undefined;
    if (reply && typeof reply === 'object' && '__error' in reply) return null;
    return (reply as T) ?? null;
  } catch {
    return null;
  }
}
