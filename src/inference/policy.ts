/**
 * The router's decisions, as data.
 *
 * Four ordered tables, one per stage of a check. Each row is a plain condition on facts the
 * router has already worked out (every threshold behind a fact comes from Remote Config), the
 * step it leads to, and why. Rows are read top to bottom; the first that matches wins, and the
 * last line of each table says what happens when none does. Nothing here calls a model or
 * touches the page, so the whole policy can be read, printed and tested on its own
 * (tests/policy.test.ts); src/inference/router.ts gathers the facts and carries out the step.
 */

export interface Rule<F, A extends string> {
  readonly when: (f: F) => boolean;
  readonly then: A;
  readonly why: string;
}

export interface Table<F, A extends string> {
  readonly rows: readonly Rule<F, A>[];
  readonly otherwise: A;
  readonly otherwiseWhy: string;
}

export function decide<F, A extends string>(table: Table<F, A>, facts: F): A {
  return table.rows.find((r) => r.when(facts))?.then ?? table.otherwise;
}

// ── 1. Before any model: is there anything to check? ──
export interface GateFacts {
  /** The page is only being read (no click, card entry or download). */
  passive: boolean;
  /** Warning signs strong enough for the on-device model. */
  localLook: boolean;
  /** The page is in a language the rules do not cover, so only the on-device model can read it. */
  wideLook: boolean;
  /** The person is about to act (a card field, a download). */
  asked: boolean;
  /** The page has not asked for anything yet. */
  nothingAskedYet: boolean;
  /** The action is risky in itself, whatever the page says. */
  neverSafe: boolean;
}
export const GATE_POLICY: Table<GateFacts, 'gate' | 'nothing_asked' | 'go_on'> = {
  rows: [
    { when: (f) => f.passive && !f.localLook && !f.wideLook, then: 'gate', why: 'A page being read with no warning signs never reaches a model.' },
    { when: (f) => f.asked && f.nothingAskedYet && !f.neverSafe, then: 'nothing_asked', why: 'The person is about to act, but the page has asked for nothing yet.' },
  ],
  otherwise: 'go_on',
  otherwiseWhy: 'There is something to check.',
};

// ── 2. Which model may look? ──
export interface ModelFacts {
  wideLook: boolean;
  /** Gemini Nano is downloaded and ready on this computer. */
  deviceReady: boolean;
  /** The page passed the stricter gate that a cloud check needs. */
  cloudLook: boolean;
}
export const MODEL_POLICY: Table<ModelFacts, 'not_checked' | 'cloud_only' | 'device'> = {
  rows: [
    { when: (f) => f.wideLook && !f.deviceReady, then: 'not_checked', why: 'The wider look is for the on-device model only; nothing goes to the cloud for it.' },
    { when: (f) => !f.deviceReady && !f.cloudLook, then: 'not_checked', why: 'With no on-device model something would have to leave the computer, so only the stricter gate may send it.' },
    { when: (f) => !f.deviceReady, then: 'cloud_only', why: 'No on-device model: the redacted cloud check, with the fail-safe bar if it cannot answer.' },
  ],
  otherwise: 'device',
  otherwiseWhy: 'Gemini Nano looks first, on the computer.',
};

// ── 3. After the on-device look. ──
export interface TriageFacts {
  wideLook: boolean;
  /** The on-device model gave a valid answer. */
  answered: boolean;
  /** Chrome said the "on-device" call ran in the cloud. */
  wrongSide: boolean;
  cloudLook: boolean;
  /** Wider look only: the model is sure (high score and confidence, and the page is not about scams). */
  wideSure: boolean;
  /** The model's score is under the low threshold. */
  deviceSaysSafe: boolean;
  /** The rules found strong evidence, or the page tries to talk its way past a checker. */
  overruled: boolean;
  /** High score, confident, a second signal agrees (rules or the full shape of a scam), and not a page about scams. */
  confirmed: boolean;
}
export type TriageStep =
  | 'not_checked'
  | 'wide_unsure'
  | 'wide_sure'
  | 'rules_wrong_side'
  | 'rules'
  | 'cloud_after_failure'
  | 'device_safe'
  | 'device_confirmed'
  | 'ask_cloud';
export const TRIAGE_POLICY: Table<TriageFacts, TriageStep> = {
  rows: [
    { when: (f) => f.wideLook && !f.answered, then: 'not_checked', why: 'Wider look and no answer: nothing is shown, and nothing goes to the cloud.' },
    { when: (f) => f.wideLook && !f.wideSure, then: 'wide_unsure', why: 'Wider look: the model alone may only raise a caution, and only when it is sure.' },
    { when: (f) => f.wideLook, then: 'wide_sure', why: 'Wider look and the model is sure: a caution, never a pause.' },
    { when: (f) => f.wrongSide, then: 'rules_wrong_side', why: 'The private check ran in the cloud: stop, send nothing more, the rules decide with the fail-safe bar.' },
    { when: (f) => !f.answered && !f.cloudLook, then: 'rules', why: 'Nano did not answer and the page did not pass the stricter gate: the rules decide.' },
    { when: (f) => !f.answered, then: 'cloud_after_failure', why: 'Nano did not answer: a copy redacted on the device goes to the cloud.' },
    { when: (f) => f.deviceSaysSafe && !f.overruled, then: 'device_safe', why: 'Nano finds nothing and the rules agree: safe, nothing sent.' },
    { when: (f) => f.confirmed, then: 'device_confirmed', why: 'Nano is sure and a second signal agrees: decided on the device, nothing sent.' },
  ],
  otherwise: 'ask_cloud',
  otherwiseWhy: 'Nano is unsure (or overruled): redact on the device, then ask the cloud.',
};

// ── 4. After asking the cloud. ──
export interface CloudFacts {
  /** The cloud gave a valid answer. */
  answered: boolean;
  /** A page being read that is plainly about scams. */
  aboutScamsPassive: boolean;
  /** Nano said "safe" but was overruled. */
  deviceSaidSafe: boolean;
}
export const CLOUD_POLICY: Table<CloudFacts, 'device_then_cloud' | 'about_scams' | 'rules_overruled' | 'device_alone'> = {
  rows: [
    { when: (f) => f.answered, then: 'device_then_cloud', why: 'The cloud leads, Nano keeps a vote; a confident "fine" from the cloud settles it.' },
    { when: (f) => f.aboutScamsPassive, then: 'about_scams', why: 'No second opinion, and a page about scams is not interrupted on the small model alone.' },
    { when: (f) => f.deviceSaidSafe, then: 'rules_overruled', why: 'No second opinion and Nano was overruled: the rules decide, as a caution.' },
  ],
  otherwise: 'device_alone',
  otherwiseWhy: 'No second opinion: Nano’s verdict stands, and it may pause only if corroborated.',
};

/** Every table, for printing and tests. */
export const POLICY = { gate: GATE_POLICY, model: MODEL_POLICY, triage: TRIAGE_POLICY, cloud: CLOUD_POLICY } as const;
