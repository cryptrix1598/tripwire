/**
 * App Check for the extension WITHOUT a debug token, at no cost.
 *
 * reCAPTCHA cannot run on a chrome-extension:// page, but it can run on Tripwire's own
 * hosted site. So the offscreen document (where every Firebase call is made) keeps a
 * hidden frame open on `<hosted site>/attest.html`. That page passes a real reCAPTCHA
 * Enterprise check, receives an App Check token for the same Firebase web app, and
 * hands it back over postMessage. No server, no paid plan, and nothing to copy out of
 * the extension: a token is only issued to a browser that reCAPTCHA accepts.
 *
 * The hosted page answers only extension origins (and itself), and the site allows
 * itself to be framed only by extensions (see firebase.json).
 */
import { dashboardUrl } from './config';

const ATTEST_PATH = '/attest.html';
const TIMEOUT_MS = 20_000;

interface Waiting {
  resolve: (value: { token: string; expireTimeMillis: number }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;
const waiting = new Map<string, Waiting>();

const siteOrigin = () => new URL(dashboardUrl).origin;

function onMessage(event: MessageEvent): void {
  if (!frame || event.source !== frame.contentWindow || event.origin !== siteOrigin()) return;
  const data = event.data as { type?: string; id?: string; token?: string; expireTimeMillis?: number; error?: string } | null;
  if (data?.type !== 'tripwire-appcheck-token' || !data.id) return;
  const entry = waiting.get(data.id);
  if (!entry) return;
  waiting.delete(data.id);
  clearTimeout(entry.timer);
  if (data.token) entry.resolve({ token: data.token, expireTimeMillis: data.expireTimeMillis ?? Date.now() + 30 * 60_000 });
  else entry.reject(new Error(data.error || 'The hosted page did not issue an App Check token.'));
}

function ensureFrame(): Promise<void> {
  ready ??= new Promise<void>((resolve, reject) => {
    if (!dashboardUrl) {
      reject(new Error('No hosted site is configured (WXT_DASHBOARD_URL), so App Check has no way to attest this browser.'));
      return;
    }
    window.addEventListener('message', onMessage);
    const el = document.createElement('iframe');
    el.src = dashboardUrl + ATTEST_PATH;
    el.title = 'Tripwire App Check';
    el.hidden = true;
    const timer = setTimeout(() => reject(new Error('The App Check page did not load.')), TIMEOUT_MS);
    el.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    frame = el;
    (document.body ?? document.documentElement).append(el);
  }).catch((err: unknown) => {
    frame?.remove();
    frame = null;
    ready = null;
    throw err;
  });
  return ready;
}

/** A fresh App Check token from the hosted page, for the CustomProvider. */
export async function attestedToken(): Promise<{ token: string; expireTimeMillis: number }> {
  await ensureFrame();
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('The App Check page did not answer.'));
    }, TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    frame?.contentWindow?.postMessage({ type: 'tripwire-appcheck-request', id }, siteOrigin());
  });
}
