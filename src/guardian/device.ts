/**
 * Family Guardian, extension side. Runs in the offscreen document.
 *
 * Auth: the protected person never has to create an account. The extension
 * signs in anonymously (firebase/auth/web-extension, which avoids the popup
 * and remote-script flows MV3 forbids) and that uid becomes the device id.
 * A family member links to it with a short-lived eight-digit code.
 */
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth/web-extension';
import {
  writeBatch,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore/lite';
import { getFirebaseApp } from '../firebase/app';
import type { ScamType, AlertAction, Trigger } from '../inference/schemas';
import type { FamilyDecision } from '../ui/hold';
import type { Outcome } from '../ui/copy';
import { buildAlert, applyDecision, choosePending, generatePairingCode, GUARDIAN_NAME_PATTERN, PAIRING_TTL_MS } from './model';

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

/** The code currently on screen, if any. A code is single-use: it is deleted as soon as someone pairs with it. */
let liveCode: string | null = null;

/** Delete the pairing code that is on screen (after a successful pairing, or when a new one is requested). */
export async function retirePairingCode(): Promise<void> {
  const code = liveCode;
  liveCode = null;
  if (!code) return;
  try {
    await deleteDoc(doc(getFirestore(getFirebaseApp()), 'pairingCodes', code));
  } catch {
    // It expires on its own within 5 minutes.
  }
}

/** Remove every family member's link. They stop seeing alerts immediately. */
export async function disconnectGuardians(): Promise<number> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  const links = await getDocs(collection(db, 'devices', user.uid, 'guardians'));
  await Promise.all(links.docs.map((link) => deleteDoc(link.ref)));
  await retirePairingCode();
  return links.size;
}

export async function createPairingCode(): Promise<{ code: string; expiresAt: number }> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  await retirePairingCode();
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
      liveCode = code;
      return { code, expiresAt };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not create a pairing code');
}

/** Family members who can see alerts (allowed), and links waiting for the person's "Yes, allow". */
export async function guardianLinks(): Promise<{ approved: number; pending: number; pendingNames: string[] }> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  const links = await getDocs(collection(db, 'devices', user.uid, 'guardians'));
  const waiting = links.docs.filter((d) => d.data().approved !== true);
  const pendingNames = waiting
    .map((d) => d.data().name)
    .filter((n): n is string => typeof n === 'string' && GUARDIAN_NAME_PATTERN.test(n.trim()))
    .map((n) => n.trim());
  return { approved: links.size - waiting.length, pending: waiting.length, pendingNames };
}

export async function guardianCount(): Promise<number> {
  return (await guardianLinks()).approved;
}

/**
 * The person's answer to "Someone just typed your code": allow every waiting link, or remove
 * them. Either way the code is switched off.
 */
export async function decidePending(allow: boolean): Promise<number> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  const links = await getDocs(collection(db, 'devices', user.uid, 'guardians'));
  const rows = links.docs.map((d) => {
    const data = d.data() as { code?: string; approved?: boolean; pairedAt?: Timestamp };
    return { id: d.id, code: data.code, approved: data.approved, pairedAtMs: data.pairedAt?.toMillis() };
  });
  const { approve, remove } = applyDecision(choosePending(rows, liveCode, Date.now()), allow);
  const byId = new Map(links.docs.map((d) => [d.id, d.ref]));
  await Promise.all([
    ...approve.map((id) => updateDoc(byId.get(id)!, { approved: true, approvedAt: serverTimestamp() })),
    ...remove.map((id) => deleteDoc(byId.get(id)!)),
  ]);
  await retirePairingCode();
  return approve.length;
}

/**
 * Tell paired family members that Tripwire stepped in. The payload is built by
 * buildAlert(), which accepts only enums: no page or email content can reach it.
 * The device's alert clock is moved in the same write; the security rules allow
 * one alert every 15 seconds, so a looping client cannot flood the family feed.
 */
export async function sendAlert(scamType: ScamType, trigger: AlertAction, outcome: Outcome): Promise<void> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  const batch = writeBatch(db);
  batch.set(doc(db, 'devices', user.uid), { lastAlertAt: serverTimestamp() }, { merge: true });
  batch.set(doc(collection(db, 'devices', user.uid, 'alerts')), {
    ...buildAlert(scamType, trigger, outcome),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

/**
 * "Tripwire is still here": a timestamp on this computer's device record, at most twice a day,
 * so the family page can say when it last heard from this computer. If Tripwire is removed or
 * switched off, the family sees it go quiet. Nothing else is written.
 */
export async function sendHeartbeat(): Promise<void> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  await setDoc(doc(db, 'devices', user.uid), { lastSeenAt: serverTimestamp() }, { merge: true });
}

/**
 * A five-minute hold has started: one document the family can see and answer ("let it go through"
 * or "keep it on hold"). Only the kind of step and the times; never the page.
 */
export async function startHold(action: Trigger, endsAt: number): Promise<void> {
  const user = await ensureSignedIn();
  const db = getFirestore(getFirebaseApp());
  await setDoc(doc(db, 'devices', user.uid, 'holds', 'current'), {
    action,
    startedAt: serverTimestamp(),
    endsAt: Timestamp.fromMillis(endsAt),
    decision: 'waiting',
  });
}

/** The family's answer to the running hold, if any. */
export async function familyDecision(): Promise<FamilyDecision | null> {
  const user = await ensureSignedIn();
  const snap = await getDoc(doc(getFirestore(getFirebaseApp()), 'devices', user.uid, 'holds', 'current'));
  const decision = snap.data()?.decision;
  return decision === 'released' || decision === 'extended' ? decision : null;
}

/** The person stopped or continued: the family page stops offering to answer. */
export async function endHold(): Promise<void> {
  const user = await ensureSignedIn();
  await updateDoc(doc(getFirestore(getFirebaseApp()), 'devices', user.uid, 'holds', 'current'), { decision: 'done' });
}
