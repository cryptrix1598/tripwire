/**
 * Family Guardian, extension side. Runs in the offscreen document.
 *
 * Auth: the protected person never has to create an account. The extension
 * signs in anonymously (firebase/auth/web-extension, which avoids the popup
 * and remote-script flows MV3 forbids) and that uid becomes the device id.
 * A family member links to it with a short-lived six-digit code.
 */
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth/web-extension';
import {
  addDoc,
  collection,
  doc,
  getCount,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore/lite';
import { getFirebaseApp } from '../firebase/app';
import type { ScamType, Trigger } from '../inference/schemas';
import type { Outcome } from '../ui/copy';
import { buildAlert, generatePairingCode, PAIRING_TTL_MS } from './model';

let userPromise: Promise<User> | null = null;

/** Resolve the signed-in (anonymous) user, signing in on first use. */
export function ensureSignedIn(): Promise<User> {
  userPromise ??= new Promise<User>((resolve, reject) => {
    const auth = getAuth(getFirebaseApp());
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop();
          resolve(user);
        } else {
          signInAnonymously(auth).catch((err) => {
            stop();
            reject(err);
          });
        }
      },
      (err) => {
        stop();
        reject(err);
      },
    );
  }).catch((err) => {
    userPromise = null;
    throw err;
  });
  return userPromise;
}

export async function createPairingCode(): Promise<{ code: string; expiresAt: number }> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  await setDoc(doc(db, 'devices', user.uid), { createdAt: serverTimestamp() }, { merge: true });

  // Rules reject a code that is still live for someone else, so retry on collision.
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = generatePairingCode();
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    try {
      await setDoc(doc(db, 'pairingCodes', code), {
        deviceId: user.uid,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(expiresAt),
      });
      return { code, expiresAt };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not create a pairing code');
}

export async function guardianCount(): Promise<number> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  const snap = await getCount(collection(db, 'devices', user.uid, 'guardians'));
  return snap.data().count;
}

/**
 * Tell paired family members that Tripwire stepped in. The payload is built by
 * buildAlert(), which accepts only enums: no page or email content can reach it.
 */
export async function sendAlert(scamType: ScamType, trigger: Trigger, outcome: Outcome): Promise<void> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  await addDoc(collection(db, 'devices', user.uid, 'alerts'), {
    ...buildAlert(scamType, trigger, outcome),
    createdAt: serverTimestamp(),
  });
}
