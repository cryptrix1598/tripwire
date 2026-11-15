// Is App Check really enforced on Firestore? This signs in (anonymously) WITHOUT
// an App Check token and tries a read the security rules would allow.
//   expected when enforced:  "refused (permission-denied)"
//   when not enforced:       "allowed"
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const app = initializeApp({ apiKey: env.WXT_FIREBASE_API_KEY, authDomain: env.WXT_FIREBASE_AUTH_DOMAIN, projectId: env.WXT_FIREBASE_PROJECT_ID, appId: env.WXT_FIREBASE_APP_ID });
const { user } = await signInAnonymously(getAuth(app));
try {
  await getDoc(doc(getFirestore(app), 'pairingCodes', '000000'));
  console.log('Firestore without an App Check token: allowed (not enforced, or not yet in effect)');
} catch (err) {
  console.log(`Firestore without an App Check token: refused (${err.code})`);
} finally {
  await deleteUser(user).catch(() => undefined);
}
process.exit(0);
