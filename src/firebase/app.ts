/**
 * Firebase app + App Check for extension contexts (offscreen document and
 * extension pages).
 *
 * App Check from a chrome-extension:// origin
 * -------------------------------------------
 * Firebase AI Logic requires App Check. The standard web providers (reCAPTCHA
 * v3 / Enterprise) load a remote script and attest a web origin; Manifest V3
 * forbids remote code and an extension has no web origin, so they cannot run
 * here.
 *
 * Release builds (`npm run zip:store`) contain no debug token. Their CustomProvider
 * gets each token from Tripwire's own hosted page, which passes a real reCAPTCHA
 * Enterprise check in a hidden frame (see attest.ts). Free, no server.
 *
 * Development and automated test builds use the App Check DEBUG provider instead
 * (a debug token from .env), because reCAPTCHA rightly refuses automated browsers.
 * In debug mode the SDK never calls the provider's getToken().
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, getToken, initializeAppCheck, type AppCheck } from 'firebase/app-check';
import { attestedToken } from './attest';
import { appCheckDebugToken, firebaseConfig, isFirebaseConfigured } from './config';

let appCheck: AppCheck | null = null;

export class NotConfiguredError extends Error {
  constructor() {
    super('Firebase is not configured. Copy .env.example to .env and fill in your project values.');
    this.name = 'NotConfiguredError';
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) throw new NotConfiguredError();
  if (getApps().length > 0) return getApp();

  const app = initializeApp(firebaseConfig);

  if (appCheckDebugToken) {
    // Must be set before initializeAppCheck().
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      appCheckDebugToken;
  }

  try {
    appCheck = initializeAppCheck(app, {
      provider: new CustomProvider({
        // Reached only when no debug token is configured: a release build.
        getToken: () => attestedToken(),
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // App Check may already be initialized for this app in this document.
    console.warn('[Tripwire] App Check init:', err);
  }

  return app;
}

export function appCheckReady(): boolean {
  return appCheck !== null;
}

/**
 * Ask the App Check backend for a token right now. Resolves to 'valid' only if
 * Firebase accepted this build's credentials and issued a real token.
 */
export async function appCheckProbe(): Promise<'valid' | string> {
  try {
    getFirebaseApp();
    if (!appCheck) return 'App Check is not initialized';
    const { token } = await getToken(appCheck, false);
    return token ? 'valid' : 'empty token';
  } catch (err) {
    return `failed: ${String(err instanceof Error ? err.message : err).slice(0, 160)}`;
  }
}
