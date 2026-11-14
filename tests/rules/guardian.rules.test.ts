/**
 * Firestore security rules for Family Guardian, run against the emulator:
 *   npm run test:rules
 *
 * The point of these tests: even a modified client cannot store page or email
 * content, read someone's alerts without a live pairing code, or list codes.
 */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { buildAlert } from '../../src/guardian/model';

const DEVICE = 'device-mum';
const GUARDIAN = 'guardian-sam';
const STRANGER = 'stranger';
const CODE = '482913';

let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const inMinutes = (m: number) => Timestamp.fromMillis(Date.now() + m * 60_000);
const validAlert = () => ({ ...buildAlert('bank_impersonation', 'card_entry', 'stopped'), createdAt: serverTimestamp() });

async function seedCode(expiresInMinutes = 15) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: Timestamp.now(), expiresAt: inMinutes(expiresInMinutes) });
  });
}
async function seedLink() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'devices', DEVICE, 'guardians', GUARDIAN), { code: CODE, pairedAt: Timestamp.now() });
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
    await assertSucceeds(setDoc(doc(as(DEVICE), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(15) }));
  });
  it('rejects a code for someone else, a long-lived code, and a malformed code', async () => {
    await assertFails(setDoc(doc(as(STRANGER), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(15) }));
    await assertFails(setDoc(doc(as(DEVICE), 'pairingCodes', CODE), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(600) }));
    await assertFails(setDoc(doc(as(DEVICE), 'pairingCodes', 'abc123'), { deviceId: DEVICE, createdAt: serverTimestamp(), expiresAt: inMinutes(15) }));
  });
  it('can be looked up one at a time but never listed', async () => {
    await seedCode();
    await assertSucceeds(getDoc(doc(as(GUARDIAN), 'pairingCodes', CODE)));
    await assertFails(getDocs(collection(as(GUARDIAN), 'pairingCodes')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pairingCodes', CODE)));
  });
});

describe('guardian links', () => {
  const link = (uid: string, code = CODE) => setDoc(doc(as(uid), 'devices', DEVICE, 'guardians', uid), { code, pairedAt: serverTimestamp() });

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
