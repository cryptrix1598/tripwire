/**
 * Firebase web config, read from build-time environment variables.
 *
 * These values identify the Firebase project; they are not secrets. The Gemini
 * API key is never here: Firebase AI Logic holds it server-side.
 */
import type { FirebaseOptions } from 'firebase/app';

const env = import.meta.env as Record<string, string | undefined>;

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.WXT_FIREBASE_API_KEY ?? '',
  authDomain: env.WXT_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.WXT_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.WXT_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.WXT_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.WXT_FIREBASE_APP_ID ?? '',
};

/** App Check debug token for development and the hackathon submission build. */
export const appCheckDebugToken: string = env.WXT_APPCHECK_DEBUG_TOKEN ?? '';

/** Where the family dashboard lives, shown to the user while pairing. */
export const dashboardUrl: string = (env.WXT_DASHBOARD_URL ?? '').replace(/\/+$/, '');

/** Where the practice scam pages live: next to the dashboard when it is hosted, else `npm run demo`. */
export const demoUrl: string = env.WXT_DEMO_URL || (dashboardUrl ? `${dashboardUrl}/demo/` : 'http://localhost:4174/');

/** False until `.env` has been filled in. The extension then runs on rules only and says so. */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}
