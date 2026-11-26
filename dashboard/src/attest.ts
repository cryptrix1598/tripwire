/**
 * attest.html: issues App Check tokens to the Tripwire extension.
 *
 * The extension cannot run reCAPTCHA itself (no web origin, no remote code under
 * Manifest V3), so it frames this page from its offscreen document. This page runs
 * reCAPTCHA Enterprise like any page on the site, gets an App Check token for the same
 * Firebase web app, and posts it back. It answers only chrome-extension:// parents
 * whose ID is Tripwire's own (src/config/extensionKey.json, plus WXT_EXTENSION_IDS) and its own origin.
 *
 * Opened directly in a browser, it shows whether a token can be issued (a self-test).
 */
import { getToken } from 'firebase/app-check';
import { appCheck } from './firebase';
import extensionKey from '../../src/config/extensionKey.json';

const env = import.meta.env as Record<string, string | undefined>;
// Tripwire's own ID (fixed by the manifest key), plus any extra IDs, such as a store listing's.
const allowedIds = [
  extensionKey.id,
  ...(env.WXT_EXTENSION_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];

function allowed(origin: string): boolean {
  if (origin === location.origin) return true;
  if (!origin.startsWith('chrome-extension://')) return false;
  return allowedIds.includes(origin.slice('chrome-extension://'.length));
}

/** When the token expires, read from its own `exp` claim. */
function expiry(token: string): number {
  try {
    const part = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(part)) as { exp?: number };
    if (claims.exp) return claims.exp * 1000;
  } catch {
    /* fall through */
  }
  return Date.now() + 30 * 60_000;
}

async function issue(): Promise<{ token: string; expireTimeMillis: number }> {
  if (!appCheck) throw new Error('App Check is not set up on this site.');
  const { token } = await getToken(appCheck, false);
  if (!token) throw new Error('App Check returned an empty token.');
  return { token, expireTimeMillis: expiry(token) };
}

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { type?: string; id?: string } | null;
  if (data?.type !== 'tripwire-appcheck-request' || !data.id) return;
  if (event.source !== window.parent || !allowed(event.origin)) return;
  const reply = (body: Record<string, unknown>) =>
    window.parent.postMessage({ type: 'tripwire-appcheck-token', id: data.id, ...body }, event.origin);
  issue()
    .then((result) => reply(result))
    .catch((err: unknown) => reply({ error: String(err instanceof Error ? err.message : err).slice(0, 200) }));
});

// Self-test when opened on its own.
if (window.parent === window) {
  const out = document.getElementById('status');
  issue()
    .then(({ expireTimeMillis }) => {
      if (out) out.textContent = `App Check token issued for this browser. It expires at ${new Date(expireTimeMillis).toLocaleTimeString()}.`;
    })
    .catch((err: unknown) => {
      if (out) out.textContent = `No token: ${String(err instanceof Error ? err.message : err)}`;
    });
}
