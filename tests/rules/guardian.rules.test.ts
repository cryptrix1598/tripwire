/**
 * Firestore security rules for Family Guardian, run against the emulator:
 *   npm run test:rules
 *
 * The point of these tests: even a modified client cannot store page or email
 * content, read someone's alerts without a live pairing code, or list codes.
 */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { buildAlert } from '../../src/guardian/model';
import { SCAM_TYPES } from '../../src/inference/schemas';

const DEVICE = 'device-mum';
const GUARDIAN = 'guardian-sam';
const STRANGER = 'stranger';
const CODE = '482913';

let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const inMinutes = (m: number) => Timestamp.fromMillis(Date.now() + m * 60_000);
const validAlert = () => ({ ...buildAlert('bank_impersonation', 'card_entry', 'stopped'), createdAt: serverTimestamp() });

async function seedCode(expiresInMinutes = 5) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: Timestamp.now(), expiresAt: inMinutes(expiresInMinutes) });
  });
}
async function seedLink(approved = true) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'devices', DEVICE, 'guardians', GUARDIAN), { code: CODE, pairedAt: Timestamp.now(), ...(approved ? { approved: true } : {}) });
    await setDoc(doc(ctx.firestore(), 'devices', DEVICE, 'alerts', 'a1'), { ...buildAlert('gift_card', 'gift_card', 'continued'), createdAt: Timestamp.now() });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-tripwire', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

describe('pairing codes', () => {
  it('lets a device publish its own short-lived code', async () => {
    await assertSucceeds(setDoc(doc(as(DEVICE), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(5) }));
  });
  it('rejects a code for someone else, a long-lived code, and a malformed code', async () => {
    await assertFails(setDoc(doc(as(STRANGER), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(5) }));
    await assertFails(setDoc(doc(as(DEVICE), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(10) }));
    await assertFails(setDoc(doc(as(DEVICE), 'pairingCodes', 'abc123'), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(5) }));
  });
  it('can be looked up one at a time but never listed', async () => {
    await seedCode();
    await assertSucceeds(getDoc(doc(as(GUARDIAN), 'pairingCodes', CODE)));
    await assertFails(getDocs(collection(as(GUARDIAN), 'pairingCodes')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pairingCodes', CODE)));
  });
});

describe('guardian links', () => {
  // Pairing is one atomic write: claim the code, create the link.
  const link = (uid: string, code = CODE) => {
    const db = as(uid);
    return writeBatch(db)
      .update(doc(db, 'pairingCodes', code), { usedBy: uid })
      .set(doc(db, 'devices', DEVICE, 'guardians', uid), { code, pairedAt: serverTimestamp() })
      .commit();
  };

  it('links with a live code', async () => {
    await seedCode();
    await assertSucceeds(link(GUARDIAN));
  });
  it('refuses a wrong code, an expired code, or no code at all', async () => {
    await assertFails(link(GUARDIAN));
    await seedCode();
    await assertFails(link(GUARDIAN, '000000'));
    await seedCode(-1);
    await assertFails(link(GUARDIAN));
  });
  it('lets a code be used once only: a second person with the same code is refused', async () => {
    await seedCode();
    await assertSucceeds(link(GUARDIAN));
    await assertFails(link(STRANGER));
  });

  it('refuses a link that does not claim the code in the same write', async () => {
    await seedCode();
    await assertFails(setDoc(doc(as(GUARDIAN), 'devices', DEVICE, 'guardians', GUARDIAN), { code: CODE, pairedAt: serverTimestamp() }));
  });

  it('does not let a claim change anything else about the code', async () => {
    await seedCode();
    await assertFails(updateDoc(doc(as(STRANGER), 'pairingCodes', CODE), { usedBy: STRANGER, deviceId: STRANGER }));
    await assertFails(updateDoc(doc(as(STRANGER), 'pairingCodes', CODE), { usedBy: GUARDIAN }));
  });

  it('refuses linking someone else, or a device to itself', async () => {
    await seedCode();
    await assertFails(setDoc(doc(as(STRANGER), 'devices', DEVICE, 'guardians', GUARDIAN), { code: CODE, pairedAt: serverTimestamp() }));
    await assertFails(link(DEVICE));
  });
});

describe('alerts', () => {
  const alertRef = (uid: string, id = 'new') => doc(as(uid), 'devices', DEVICE, 'alerts', id);

  it('accepts the fixed five-field alert from the device', async () => {
    await assertSucceeds(setDoc(alertRef(DEVICE), validAlert()));
  });
  it('rejects any extra field, so page or email text cannot be stored', async () => {
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), pageText: 'Dear Margaret, your card 4111 1111 1111 1111' }));
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), url: 'https://example.com/inbox/123' }));
  });
  it('rejects any summary that is not the fixed sentence for that kind of scam', async () => {
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), summary: 'Dear Margaret, your card 4111 1111 1111 1111 was charged.' }));
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), summary: 'ok' }));
    // A real sentence, but for a different kind of scam.
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), summary: buildAlert('gift_card', 'card_entry', 'stopped').summary }));
  });

  it('accepts the fixed sentence for every kind of scam', async () => {
    for (const type of SCAM_TYPES) {
      await assertSucceeds(setDoc(alertRef(DEVICE, `ok-${type}`), { ...buildAlert(type, 'passive', 'stopped'), createdAt: serverTimestamp() }));
    }
  });

  it('rejects long summaries, unknown enums, a backdated time and missing fields', async () => {
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), summary: 'x'.repeat(201) }));
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), scamType: 'whatever' }));
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), action: 'read_email' }));
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), outcome: 'maybe' }));
    await assertFails(setDoc(alertRef(DEVICE), { ...validAlert(), createdAt: Timestamp.fromMillis(0) }));
    const { summary: _dropped, ...missing } = validAlert();
    await assertFails(setDoc(alertRef(DEVICE), missing));
  });
  it('only the device can write; alerts cannot be changed or deleted', async () => {
    await seedLink();
    await assertFails(setDoc(alertRef(GUARDIAN), validAlert()));
    await assertFails(setDoc(alertRef(STRANGER), validAlert()));
    await assertFails(updateDoc(alertRef(DEVICE, 'a1'), { outcome: 'stopped' }));
    await assertFails(deleteDoc(alertRef(DEVICE, 'a1')));
  });
  it('a paired guardian can read; a stranger cannot', async () => {
    await seedLink();
    await assertSucceeds(getDocs(collection(as(GUARDIAN), 'devices', DEVICE, 'alerts')));
    await assertSucceeds(getDocs(collection(as(DEVICE), 'devices', DEVICE, 'alerts')));
    await assertFails(getDocs(collection(as(STRANGER), 'devices', DEVICE, 'alerts')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'devices', DEVICE, 'alerts', 'a1')));
  });
});

describe('approval: a code alone is not enough', () => {
  const alerts = (uid: string) => getDocs(collection(as(uid), 'devices', DEVICE, 'alerts'));
  const linkRef = (uid: string) => doc(as(uid), 'devices', DEVICE, 'guardians', GUARDIAN);

  it('a linked guardian cannot read alerts until the device allows it', async () => {
    await seedLink(false);
    await assertFails(alerts(GUARDIAN));
  });

  it('the guardian cannot approve itself; a stranger cannot either', async () => {
    await seedLink(false);
    await assertFails(updateDoc(linkRef(GUARDIAN), { approved: true }));
    await assertFails(updateDoc(linkRef(STRANGER), { approved: true }));
  });

  it('the device can approve, and then the guardian can read', async () => {
    await seedLink(false);
    await assertSucceeds(updateDoc(linkRef(DEVICE), { approved: true }));
    await assertSucceeds(alerts(GUARDIAN));
  });

  it('approving is the only change the device can make to a link', async () => {
    await seedLink(false);
    await assertFails(updateDoc(linkRef(DEVICE), { approved: true, code: '111111' }));
    await assertFails(updateDoc(linkRef(DEVICE), { approved: false }));
  });

  it('the device can refuse a link by deleting it', async () => {
    await seedLink(false);
    await assertSucceeds(deleteDoc(linkRef(DEVICE)));
  });
});

describe('the name on a link', () => {
  const claim = (name: unknown) => {
    const db = as(GUARDIAN);
    return writeBatch(db)
      .update(doc(db, 'pairingCodes', CODE), { usedBy: GUARDIAN })
      .set(doc(db, 'devices', DEVICE, 'guardians', GUARDIAN), { code: CODE, pairedAt: serverTimestamp(), name })
      .commit();
  };
  it('a short first name is accepted', async () => {
    await seedCode();
    await assertSucceeds(claim('Sam'));
  });
  it('an empty, overlong or non-text name is refused', async () => {
    await seedCode();
    await assertFails(claim(''));
    await assertFails(claim('x'.repeat(41)));
    await assertFails(claim(42));
  });
});

describe("a guardian's list of people", () => {
  it('is private to that guardian', async () => {
    const mine = doc(as(GUARDIAN), 'guardians', GUARDIAN, 'people', DEVICE);
    await assertSucceeds(setDoc(mine, { nickname: 'Mum', addedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(mine));
    await assertFails(getDoc(doc(as(STRANGER), 'guardians', GUARDIAN, 'people', DEVICE)));
    await assertFails(setDoc(doc(as(STRANGER), 'guardians', GUARDIAN, 'people', DEVICE), { nickname: 'x', addedAt: serverTimestamp() }));
    await assertFails(setDoc(mine, { nickname: 'n'.repeat(41), addedAt: serverTimestamp() }));
  });
});
