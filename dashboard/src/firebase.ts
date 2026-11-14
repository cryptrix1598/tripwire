/**
 * Firebase for the family dashboard: Auth and Firestore only. The dashboard
 * runs no AI and never receives page or email content.
 *
 * App Check: a hosted dashboard uses reCAPTCHA v3 (set WXT_RECAPTCHA_SITE_KEY).
 * The debug token is used only by the local dev server and is never built in.
 */
import { initializeApp } from 'firebase/app';
import { CustomProvider, ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// The debug token is set by dashboard/vite.config.ts: present on the local dev server, an empty string in every build.
import { appCheckDebugToken, firebaseConfig, isFirebaseConfigured } from '../../src/firebase/config';

export const configured = isFirebaseConfigured();
const app = configured ? initializeApp(firebaseConfig) : null;

if (app) {
  const siteKey = (import.meta.env as Record<string, string | undefined>).WXT_RECAPTCHA_SITE_KEY;
  try {
    if (siteKey) {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    } else if (import.meta.env.DEV && appCheckDebugToken) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
      initializeAppCheck(app, {
        provider: new CustomProvider({ getToken: () => Promise.reject(new Error('Debug token only')) }),
        isTokenAutoRefreshEnabled: true,
      });
    }
  } catch {
    // Without App Check the app still loads; Firestore will refuse if enforcement is on.
  }
}

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
