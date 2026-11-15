/**
 * Firebase for the family dashboard: Auth and Firestore only. The dashboard
 * runs no AI and never receives page or email content.
 *
 * App Check: a hosted dashboard uses reCAPTCHA Enterprise (set WXT_RECAPTCHA_SITE_KEY; the site key is public).
 * The debug token is used only by the local dev server and is never built in.
 */
import { initializeApp } from 'firebase/app';
import { CustomProvider, ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// The debug token is set by dashboard/vite.config.ts: present on the local dev server, an empty string in every build.
import { appCheckDebugToken, firebaseConfig, isFirebaseConfigured } from '../../src/firebase/config';

export const configured = isFirebaseConfigured();
const app = configured ? initializeApp(firebaseConfig) : null;

if (app) {
  const siteKey = (import.meta.env as Record<string, string | undefined>).WXT_RECAPTCHA_SITE_KEY;
  try {
    if (import.meta.env.DEV && appCheckDebugToken) {
      // Local dev server only: the debug token, so tests do not depend on a reCAPTCHA score.
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
      initializeAppCheck(app, {
        provider: new CustomProvider({ getToken: () => Promise.reject(new Error('Debug token only')) }),
        isTokenAutoRefreshEnabled: true,
      });
    } else if (siteKey) {
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
    }
  } catch {
    // Without App Check the app still loads; Firestore will refuse if enforcement is on.
  }
}

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
