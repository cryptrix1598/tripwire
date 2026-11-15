/**
 * Service worker: coordinates everything, runs no AI itself.
 *
 * Chrome's Prompt API is not available in workers, so inference lives in the
 * offscreen document. The worker's jobs are to keep that document alive, relay
 * checks to it, remember each tab's verdict, and watch for risky downloads.
 */
import { DEFAULT_CONFIG } from '../config/defaults';
import { applySensitivity, isTrusted, loadSettings } from '../config/settings';
import { loadConfig } from '../config/store';
import type { AiEngine } from '../inference/engine';
import { assess, escalateForAction } from '../inference/router';
import { DOWNLOAD_PAUSE, RULE_FLAG } from '../ui/copy';
import type { Verdict } from '../inference/schemas';
import {
  send,
  type AssessReply,
  type PairingReply,
  type PendingDownloadReply,
  type StatusReply,
  type TabStateReply,
  type ToBackground,
  type ToContent,
  type ToOffscreen,
} from '../messaging';

const OFFSCREEN_PATH = '/offscreen.html';
const TAB_KEY = (tabId: number) => `tab:${tabId}`;
const ACK_KEY = (tabId: number, page: string) => `ack:${tabId}:${page}`;
const DOWNLOAD_KEY = (id: number) => `download:${id}`;
const FLAGGED_KEY = 'flagged';
const REMOTE_OK_KEY = 'tripwire.remoteAccessOk';

interface TabState {
  verdict: Verdict;
  hostname: string;
  at: number;
  trusted?: boolean;
}
interface FlaggedEntry extends TabState {
  tabId: number;
}

/** Used only if the offscreen document cannot be reached: built-in rules, no models. */
const noModelEngine: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: async () => Promise.reject(new Error('no model in service worker')),
  redactOnDevice: async () => Promise.reject(new Error('no model in service worker')),
  analyzeInCloud: async () => Promise.reject(new Error('no model in service worker')),
};

/* ---------- offscreen document ---------- */

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
      justification:
        'Hosts the on-device Gemini Nano model (Prompt API is unavailable in service workers) and the Firebase SDK, to check page text for scams.',
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

async function toOffscreen<T>(message: ToOffscreen): Promise<T | null> {
  try {
    await ensureOffscreen();
  } catch {
    return null;
  }
  return send<T>(message);
}

/* ---------- per-tab state ---------- */

async function rememberVerdict(tabId: number, hostname: string, verdict: Verdict, lowThreshold: number, trusted = false): Promise<void> {
  const state: TabState = { verdict, hostname, at: Date.now(), trusted };
  const updates: Record<string, unknown> = { [TAB_KEY(tabId)]: state };

  if (verdict.riskScore >= lowThreshold || verdict.failSafe) {
    const stored = await chrome.storage.session.get(FLAGGED_KEY);
    const list = ((stored[FLAGGED_KEY] as FlaggedEntry[] | undefined) ?? []).filter((e) => e.tabId !== tabId);
    list.push({ ...state, tabId });
    updates[FLAGGED_KEY] = list.slice(-20);
  }
  await chrome.storage.session.set(updates);
  await paintBadge(tabId, verdict);
}

async function paintBadge(tabId: number, verdict: Verdict): Promise<void> {
  try {
    if (verdict.state === 'safe') {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: verdict.state === 'tripped' ? '#1F3A5F' : '#B26A00' });
    await chrome.action.setBadgeTextColor?.({ tabId, color: '#FFFFFF' });
  } catch {
    // The tab may already be gone.
  }
}

/* ---------- message handlers ---------- */

async function handleAssess(msg: Extract<ToBackground, { type: 'assess' }>, tabId: number | undefined): Promise<AssessReply> {
  const settings = await loadSettings();
  const config = applySensitivity(await loadConfig(), settings.sensitivity);

  // A site the person marked as trusted is never checked: nothing is read into a model, nothing is shown.
  if (isTrusted(msg.input.hostname, settings.trustedSites)) {
    const verdict: Verdict = {
      state: 'safe', riskScore: 0, scamType: 'none', redFlags: [], explanation: '', confidence: 1, route: 'not_checked',
      trigger: msg.input.trigger, bytesSentToCloud: 0, redactionCount: 0, failSafe: false, cloudUnreachable: false,
      promptVersion: config.promptVersion, elapsedMs: 0,
    };
    if (tabId !== undefined) await rememberVerdict(tabId, msg.input.hostname, verdict, config.thresholds.low, true);
    return { verdict, acknowledged: false };
  }

  const input = settings.explainInBrowserLanguage ? msg.input : { ...msg.input, language: undefined };
  let verdict = await toOffscreen<Verdict>({ target: 'offscreen', type: 'assess', input });
  if (!verdict) {
    // Offscreen document unreachable. Never fail open: fall back to built-in rules.
    verdict = await assess(input, { engine: noModelEngine, config });
  }

  let acknowledged = false;
  if (tabId !== undefined) {
    await rememberVerdict(tabId, msg.input.hostname, verdict, config.thresholds.low);
    const key = ACK_KEY(tabId, msg.page ?? msg.input.hostname);
    acknowledged = Boolean((await chrome.storage.session.get(key))[key]);
  }
  return { verdict, acknowledged };
}

async function handleOutcome(msg: Extract<ToBackground, { type: 'outcome' }>, tabId: number | undefined): Promise<void> {
  if (msg.outcome === 'continued' && tabId !== undefined) {
    await chrome.storage.session.set({ [ACK_KEY(tabId, msg.page ?? msg.hostname)]: Date.now() });
  }
  if (msg.downloadId !== undefined) {
    const key = DOWNLOAD_KEY(msg.downloadId);
    const pending = (await chrome.storage.session.get(key))[key] as PendingDownloadReply | undefined;
    if (msg.outcome === 'continued' && pending?.tool) {
      const ok = ((await chrome.storage.local.get(REMOTE_OK_KEY))[REMOTE_OK_KEY] as Record<string, number> | undefined) ?? {};
      await chrome.storage.local.set({ [REMOTE_OK_KEY]: { ...ok, [pending.tool]: Date.now() } });
    }
    try {
      if (msg.outcome === 'continued') await chrome.downloads.resume(msg.downloadId);
      else await chrome.downloads.cancel(msg.downloadId);
    } catch {
      // Already finished or removed.
    }
    await chrome.storage.session.remove(DOWNLOAD_KEY(msg.downloadId));
  }
  // Best effort: a failed alert must never get in the person's way.
  void toOffscreen({ target: 'offscreen', type: 'alert', scamType: msg.scamType, trigger: msg.trigger, outcome: msg.outcome });
}

async function handleStatus(): Promise<StatusReply> {
  const status = await toOffscreen<StatusReply>({ target: 'offscreen', type: 'status' });
  if (status) return status;
  const config = await loadConfig();
  return {
    firebaseConfigured: false,
    onDevice: 'unavailable',
    promptApiInOffscreen: false,
    guardianReady: false,
    guardianCount: 0,
    configSource: 'default',
    promptVersion: config.promptVersion,
    thresholds: config.thresholds,
  };
}

async function handle(msg: ToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  switch (msg.type) {
    case 'assess':
      return handleAssess(msg, tabId);
    case 'outcome':
      await handleOutcome(msg, tabId);
      return { ok: true };
    case 'leave':
      if (tabId !== undefined) await chrome.tabs.update(tabId, { url: chrome.runtime.getURL('/safe.html') });
      return { ok: true };
    case 'takeover':
      if (tabId !== undefined) {
        // Stored like a paused download, under an id no real download can have.
        const pending: PendingDownloadReply = { verdict: msg.verdict, filename: '', page: msg.page, hostname: msg.hostname };
        await chrome.storage.session.set({ [DOWNLOAD_KEY(-tabId)]: pending });
        await chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`/pause.html#${-tabId}`) });
      }
      return { ok: true };
    case 'frame-card-intent':
      // A payment field in an embedded frame was focused: let the top frame decide.
      if (tabId !== undefined) {
        const relay: ToContent = { target: 'content', type: 'card-intent-in-frame' };
        await chrome.tabs.sendMessage(tabId, relay, { frameId: 0 }).catch(() => undefined);
      }
      return { ok: true };
    case 'get-tab-state': {
      const stored = await chrome.storage.session.get(TAB_KEY(msg.tabId));
      const state = stored[TAB_KEY(msg.tabId)] as TabState | undefined;
      return { verdict: state?.verdict ?? null, hostname: state?.hostname ?? null, trusted: state?.trusted ?? false } satisfies TabStateReply;
    }
    case 'get-status':
      return handleStatus();
    case 'pairing-code':
      return (
        (await toOffscreen<PairingReply>({ target: 'offscreen', type: 'pairing-code' })) ??
        ({ ok: false, reason: 'offline' } satisfies PairingReply)
      );
    case 'pairing-finish':
      await toOffscreen({ target: 'offscreen', type: 'pairing-finish' });
      return { ok: true };
    case 'family-disconnect':
      return (await toOffscreen<{ ok: boolean }>({ target: 'offscreen', type: 'family-disconnect' })) ?? { ok: false };
    case 'get-pending-download': {
      const key = DOWNLOAD_KEY(msg.downloadId);
      const stored = (await chrome.storage.session.get(key))[key] as PendingDownloadReply | undefined;
      return stored ?? ({ verdict: null, filename: '' } satisfies PendingDownloadReply);
    }
  }
}

/* ---------- remote-access download tripwire ---------- */

const handledDownloads = new Set<number>();

async function inspectDownload(id: number, ...names: Array<string | undefined>): Promise<void> {
  if (handledDownloads.has(id)) return;
  const haystack = names.filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return;

  const config = await loadConfig().catch(() => DEFAULT_CONFIG);
  if (!config.remoteAccessTools.some((tool) => haystack.includes(tool.toLowerCase()))) return;

  // Only step in if a flagged page was open recently. Installing a remote
  // support tool on your own initiative is none of Tripwire's business.
  const stored = await chrome.storage.session.get(FLAGGED_KEY);
  const cutoff = Date.now() - config.flaggedPageMemoryMinutes * 60_000;
  const recent = ((stored[FLAGGED_KEY] as FlaggedEntry[] | undefined) ?? []).filter((e) => e.at >= cutoff);
  const flagged = recent.sort((a, b) => b.verdict.riskScore - a.verdict.riskScore)[0];
  const tool = config.remoteAccessTools.find((t) => haystack.includes(t.toLowerCase())) ?? '';
  if (!flagged) {
    // No suspicious page was open, which is exactly the phone-scam case: the caller names the
    // site. Tripwire asks once per tool; saying "continue" is remembered for 30 days.
    const ok = ((await chrome.storage.local.get(REMOTE_OK_KEY))[REMOTE_OK_KEY] as Record<string, number> | undefined) ?? {};
    if ((ok[tool] ?? 0) > Date.now() - 30 * 86_400_000) return;
  }

  handledDownloads.add(id);
  try {
    await chrome.downloads.pause(id);
  } catch {
    // Too late to pause (tiny file): still warn.
  }

  const verdict: Verdict = flagged
    ? escalateForAction(flagged.verdict, 'remote_download', config)
    : {
        state: 'tripped', riskScore: config.thresholds.high, scamType: 'tech_support', redFlags: [RULE_FLAG.remoteAccess],
        explanation: DOWNLOAD_PAUSE.alwaysAsk, confidence: 0.5, route: 'rules_only', trigger: 'remote_download',
        bytesSentToCloud: 0, redactionCount: 0, failSafe: false, cloudUnreachable: false, promptVersion: config.promptVersion, elapsedMs: 0,
      };
  const filename = names.find(Boolean)?.split(/[\\/]/).pop() ?? '';
  const pending: PendingDownloadReply = { verdict, filename, tool };
  await chrome.storage.session.set({ [DOWNLOAD_KEY(id)]: pending });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`/pause.html#${id}`), active: true });
}

/* ---------- wiring ---------- */

export function startBackground(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
    }
    void toOffscreen({ target: 'offscreen', type: 'refresh-config' });
  });

  chrome.runtime.onStartup.addListener(() => {
    void toOffscreen({ target: 'offscreen', type: 'refresh-config' });
  });

  chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
    if (!msg || msg.target !== 'background') return false;
    handle(msg, sender)
      .then((reply) => sendResponse(reply ?? { ok: true }))
      .catch((err) => sendResponse({ __error: String(err) }));
    return true;
  });

  chrome.downloads.onCreated.addListener((item) => {
    void inspectDownload(item.id, item.filename, item.finalUrl, item.url);
  });
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.filename?.current) void inspectDownload(delta.id, delta.filename.current);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.remove(TAB_KEY(tabId));
  });
}
