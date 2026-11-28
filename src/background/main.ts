/**
 * Service worker: coordinates everything, runs no AI itself.
 *
 * Chrome's Prompt API is not available in workers, so inference lives in the
 * offscreen document. The worker's jobs are to keep that document alive, relay
 * checks to it, remember each tab's verdict, and watch for risky downloads.
 */
import { ROUTES } from '../inference/schemas';
import { DEFAULT_CONFIG } from '../config/defaults';
import { applySensitivity, isTrusted, loadSettings } from '../config/settings';
import { loadConfig } from '../config/store';
import type { AiEngine } from '../inference/engine';
import { assess, escalateForAction, type TransferAssessment } from '../inference/router';
import { DOWNLOAD_PAUSE, POPUP, RULE_FLAG } from '../ui/copy';
import { FAMILY_HOLD_MS, HOLD_MS, nextHoldEnd, type FamilyDecision } from '../ui/hold';
import { riskIsRecent } from '../tripwires/transfer';
import { dashboardUrl } from '../firebase/config';
import { SENSITIVITY, SettingsSchema } from '../config/settings';
import type { Verdict } from '../inference/schemas';
import {
  fromOwnPage,
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
      reasons: [chrome.offscreen.Reason.DOM_SCRAPING, chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification:
        'Hosts the on-device Gemini Nano model (Prompt API is unavailable in service workers) and the Firebase SDK, to check page text for scams, and a frame of Tripwire\'s own site that proves to Firebase App Check that this is a real browser.',
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
    await chrome.action.setBadgeBackgroundColor({ tabId, color: verdict.state === 'tripped' ? '#15335F' : '#3C5C8F' });
    await chrome.action.setBadgeTextColor?.({ tabId, color: '#FFFFFF' });
  } catch {
    // The tab may already be gone.
  }
}

/* ---------- message handlers ---------- */

/** The toolbar icon shows "…" while this tab's check is running. */
async function markChecking(tabId: number, on: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#15335F' });
    await chrome.action.setBadgeText({ tabId, text: on ? '…' : '' });
    await chrome.action.setTitle({ tabId, title: on ? 'Tripwire is checking this page' : 'Tripwire' });
  } catch {
    // The tab closed.
  }
}

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
  // A check that reaches a model takes a few seconds. Say so quietly on the toolbar icon (never on
  // the page), so a pause that arrives a moment later does not come out of nowhere.
  const showBusy = tabId !== undefined ? setTimeout(() => void markChecking(tabId, true), 400) : undefined;
  let verdict = await toOffscreen<Verdict>({ target: 'offscreen', type: 'assess', input }).finally(() => {
    clearTimeout(showBusy);
    if (tabId !== undefined) void markChecking(tabId, false);
  });
  if (!verdict) {
    // Offscreen document unreachable. Never fail open: fall back to built-in rules.
    verdict = await assess(input, { engine: noModelEngine, config });
  }

  // Remembered for an hour: a bank transfer soon after a warning or a call check is paused (src/tripwires/transfer.ts).
  if (verdict.state !== 'safe') await chrome.storage.session.set({ [RISK_KEY]: Date.now() });
  void heartbeat();

  let acknowledged = false;
  if (tabId !== undefined) {
    await rememberVerdict(tabId, msg.input.hostname, verdict, config.thresholds.low);
    const key = ACK_KEY(tabId, msg.page ?? msg.input.hostname);
    acknowledged = Boolean((await chrome.storage.session.get(key))[key]);
  }
  return { verdict, acknowledged };
}

const ACTIVE_HOLD_KEY = 'hold:active';

async function handleOutcome(msg: Extract<ToBackground, { type: 'outcome' }>, tabId: number | undefined): Promise<void> {
  // The person stopped or went on: a hold the family could answer is over.
  const active = (await chrome.storage.session.get(ACTIVE_HOLD_KEY))[ACTIVE_HOLD_KEY];
  if (typeof active === 'string' && tabId !== undefined && active.startsWith(`hold:${tabId}:`)) {
    await chrome.storage.session.remove(ACTIVE_HOLD_KEY);
    void toOffscreen({ target: 'offscreen', type: 'hold-end' });
  }
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
    guardianCount: 0, pendingGuardians: 0,
    configSource: 'default',
    promptVersion: config.promptVersion,
    thresholds: config.thresholds,
  };
}

/**
 * Messages only the extension's own pages may send (the popup, settings, onboarding, the pause page),
 * never a content script running inside a web page: pairing, disconnecting the family, and reading a
 * tab's verdict (which holds the "what was sent" receipt).
 */
const OWN_PAGES_ONLY: ReadonlySet<ToBackground['type']> = new Set([
  'get-tab-state',
  'get-pending-download',
  'pairing-code',
  'pairing-decide',
  'pairing-finish',
  'family-disconnect',
]);

async function handle(msg: ToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  switch (msg.type) {
    case 'assess':
      return handleAssess(msg, tabId);
    case 'outcome':
      await handleOutcome(msg, tabId);
      return { ok: true };
    case 'assess-transfer': {
      // A warning or call check in this browser within the hour counts, whichever tab it was in.
      const at = (await chrome.storage.session.get(RISK_KEY))[RISK_KEY];
      const input = { ...msg.input, recentRisk: msg.input.recentRisk || riskIsRecent(typeof at === 'number' ? at : undefined, Date.now(), (await loadConfig()).thresholds.recentRiskMinutes * 60_000) };
      const plain: TransferAssessment = { firmness: input.recentRisk || input.newPayee ? 'hold' : 'none', route: 'not_checked', redFlags: [], scamType: 'none', elapsedMs: 0, recentRisk: input.recentRisk };
      if (input.recentRisk || !input.newPayee) return plain;
      // A new payee: Gemini Nano reads the form, on the device, for the most specific reason to show.
      // The hold does not depend on its answer, so the person never waits on it: if Nano is busy (a page
      // check ahead of it in the queue, a slow first call) the pause shows now with the plain reason.
      const quick = new Promise<null>((done) => setTimeout(() => done(null), TRANSFER_WAIT_MS));
      const fromDevice = await Promise.race([toOffscreen<TransferAssessment>({ target: 'offscreen', type: 'assess-transfer', input }).catch(() => null), quick]);
      // Anything but a well-formed answer (an error from the model, a timeout) gets the plain hold.
      const wellFormed = fromDevice && (fromDevice.firmness === 'hold' || fromDevice.firmness === 'none') && Array.isArray(fromDevice.redFlags) && (ROUTES as readonly string[]).includes(fromDevice.route);
      if (fromDevice && !wellFormed) console.warn('tripwire: transfer answer not usable', JSON.stringify(fromDevice).slice(0, 300));
      return wellFormed ? { ...fromDevice, firmness: plain.firmness === 'hold' ? 'hold' : fromDevice.firmness, recentRisk: input.recentRisk } : plain;
    }
    case 'hold': {
      // Kept per tab and page in session storage, so a reload neither restarts nor skips it.
      const key = `hold:${tabId ?? 'none'}:${msg.page}`;
      const familyKey = `holdFamily:${key}`;
      const stored = await chrome.storage.session.get([key, familyKey, 'test:holdMs']);
      const holdMs = typeof stored['test:holdMs'] === 'number' ? (stored['test:holdMs'] as number) : HOLD_MS;
      const existing = stored[key] as number | undefined;
      const family = (stored[familyKey] as { told?: boolean; decision?: FamilyDecision; checkedAt?: number } | undefined) ?? {};
      let endsAt = nextHoldEnd(existing, Date.now(), msg.extend === true, holdMs);
      if (existing === undefined && msg.action) {
        // A new hold: a paired family member can answer it from their page. Not awaited, so the clock never waits.
        await chrome.storage.session.set({ [ACTIVE_HOLD_KEY]: key });
        void toOffscreen<{ told: boolean }>({ target: 'offscreen', type: 'hold-start', action: msg.action, endsAt }).then(async (r) => {
          if (r?.told) await chrome.storage.session.set({ [familyKey]: { told: true } });
        });
      } else if (family.told && !family.decision && Date.now() - (family.checkedAt ?? 0) >= 4000) {
        // The pause asks every few seconds; look for the family's answer at most that often.
        const r = await toOffscreen<{ decision: FamilyDecision | null }>({ target: 'offscreen', type: 'hold-check' });
        family.checkedAt = Date.now();
        if (r?.decision) {
          family.decision = r.decision;
          endsAt = r.decision === 'released' ? Date.now() : Math.max(endsAt, Date.now()) + FAMILY_HOLD_MS;
        }
        await chrome.storage.session.set({ [familyKey]: family });
      }
      await chrome.storage.session.set({ [key]: endsAt });
      return { endsAt, told: family.told === true, ...(family.decision ? { family: family.decision } : {}) };
    }
    case 'open-call':
      await openCallCheck();
      return { ok: true };
    case 'leave':
      if (tabId !== undefined) await chrome.tabs.update(tabId, { url: chrome.runtime.getURL('/safe.html') });
      return { ok: true };
    case 'takeover':
      // Only the page itself (its top frame) may hand its pause to an extension page.
      if (tabId !== undefined && sender.frameId === 0) {
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
    case 'pairing-code': {
      // "Connect your family" is a script scammers use too: no code within an hour of a warning.
      const at = (await chrome.storage.session.get(RISK_KEY))[RISK_KEY];
      if (riskIsRecent(typeof at === 'number' ? at : undefined, Date.now(), (await loadConfig()).thresholds.recentRiskMinutes * 60_000)) return { ok: false, reason: 'recent_risk' } satisfies PairingReply;
      return (
        (await toOffscreen<PairingReply>({ target: 'offscreen', type: 'pairing-code' })) ??
        ({ ok: false, reason: 'offline' } satisfies PairingReply)
      );
    }
    case 'pairing-decide':
      return (await toOffscreen({ target: 'offscreen', type: 'pairing-decide', allow: msg.allow })) ?? { ok: false };
    case 'pairing-finish':
      await toOffscreen({ target: 'offscreen', type: 'pairing-finish' });
      return { ok: true };
    case 'family-disconnect': {
      // "Cut your family off" is a scammer's line too: not within an hour of a warning.
      const at = (await chrome.storage.session.get(RISK_KEY))[RISK_KEY];
      if (riskIsRecent(typeof at === 'number' ? at : undefined, Date.now(), (await loadConfig()).thresholds.recentRiskMinutes * 60_000)) return { ok: false, reason: 'recent_risk' };
      return (await toOffscreen<{ ok: boolean }>({ target: 'offscreen', type: 'family-disconnect' })) ?? { ok: false };
    }
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

/** The phone-call check, in its own tab. */
async function openCallCheck(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('/call.html'), active: true });
}

/** A closed tab's verdict, its entry in the recent-flags list (which holds what was sent) and its "continue" answers all go. */
async function forgetTab(tabId: number): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k === TAB_KEY(tabId) || k.startsWith(`ack:${tabId}:`) || k.startsWith(`hold:${tabId}:`));
  if (keys.length) await chrome.storage.session.remove(keys);
  const flagged = (all[FLAGGED_KEY] as FlaggedEntry[] | undefined) ?? [];
  if (flagged.some((e) => e.tabId === tabId)) await chrome.storage.session.set({ [FLAGGED_KEY]: flagged.filter((e) => e.tabId !== tabId) });
}

/* ---------- recent risk, protection changes, still here ---------- */

const RISK_KEY = 'risk:lastAt';
/** The longest a bank-transfer pause waits for Gemini Nano's reason before showing with the plain one. */
const TRANSFER_WAIT_MS = 2500;
const HEARTBEAT_KEY = 'heartbeat:at';
const HEARTBEAT_EVERY_MS = 12 * 60 * 60_000;

/** At most twice a day, and only does anything when someone is paired (the offscreen document checks). */
async function heartbeat(): Promise<void> {
  const at = (await chrome.storage.local.get(HEARTBEAT_KEY))[HEARTBEAT_KEY];
  if (typeof at === 'number' && Date.now() - at < HEARTBEAT_EVERY_MS) return;
  await chrome.storage.local.set({ [HEARTBEAT_KEY]: Date.now() });
  await toOffscreen({ target: 'offscreen', type: 'heartbeat' });
}

/**
 * Scammers coach people into switching protection off ("add our site to the safe list"). The family
 * hears about any change that weakens it, from whichever page made the change.
 */
function watchProtection(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['tripwire.settings']) return;
    const before = SettingsSchema.safeParse(changes['tripwire.settings'].oldValue);
    const after = SettingsSchema.safeParse(changes['tripwire.settings'].newValue);
    if (!before.success || !after.success) return;
    const added = after.data.trustedSites.some((site) => !before.data.trustedSites.includes(site));
    const lowered = SENSITIVITY.indexOf(after.data.sensitivity) < SENSITIVITY.indexOf(before.data.sensitivity);
    if (added) void toOffscreen({ target: 'offscreen', type: 'alert', scamType: 'none', trigger: 'trusted_site', outcome: 'changed' });
    else if (lowered) void toOffscreen({ target: 'offscreen', type: 'alert', scamType: 'none', trigger: 'setting_lowered', outcome: 'changed' });
  });
}

/** If Tripwire is removed, Chrome opens a page that says: if a caller told you to do this, hang up. */
function setRemovalPage(): void {
  try {
    if (dashboardUrl) void chrome.runtime.setUninstallURL(new URL('/removed.html', dashboardUrl).href);
  } catch {
    // No hosted site configured.
  }
}

/* ---------- wiring ---------- */

export function startBackground(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
    }
    // Right-click on any page, or on the toolbar icon: "Someone is on the phone with me".
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'check-a-call', title: POPUP.callCheck, contexts: ['page', 'action'] }, () => void chrome.runtime.lastError);
    });
    void toOffscreen({ target: 'offscreen', type: 'refresh-config' });
    setRemovalPage();
    void heartbeat();
  });

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'check-a-call') void openCallCheck();
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'check-a-call') void openCallCheck();
  });

  chrome.runtime.onStartup.addListener(() => {
    void toOffscreen({ target: 'offscreen', type: 'refresh-config' });
    setRemovalPage();
    void heartbeat();
  });
  watchProtection();

  chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
    if (!msg || msg.target !== 'background' || sender.id !== chrome.runtime.id) return false;
    if (OWN_PAGES_ONLY.has(msg.type) && !fromOwnPage(sender)) {
      sendResponse({ ok: false });
      return false;
    }
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

  chrome.tabs.onRemoved.addListener((tabId) => void forgetTab(tabId));
}
