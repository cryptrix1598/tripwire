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
 * Development and the hackathon submission use the App Check DEBUG provider:
 * a debug token (from .env, registered in the Firebase console) is exchanged
 * for real App Check tokens. In debug mode the SDK never calls the provider's
 * getToken(), so a CustomProvider is passed purely to satisfy the API, with no
 * remote script involved. (Verified against @firebase/app-check 0.13.1.)
 *
 * Production path: keep the CustomProvider, but have getToken() call a small
 * backend (Cloud Functions + Admin SDK `appCheck().createToken(appId)`) that
 * first verifies the caller, for example with a Chrome Web Store licence or a
 * signed-in user. See README → "App Check from a chrome-extension:// origin".
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck, type AppCheck } from 'firebase/app-check';
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
        getToken: async () => {
          // Reached only when no debug token is configured.
          throw new Error(
            'No App Check provider for this build. Set WXT_APPCHECK_DEBUG_TOKEN, or implement the production token endpoint.',
          );
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // App Check may already be initialised for this app in this document.
    console.warn('[Tripwire] App Check init:', err);
  }

  return app;
}

export function appCheckReady(): boolean {
  return appCheck !== null && Boolean(appCheckDebugToken);
}
