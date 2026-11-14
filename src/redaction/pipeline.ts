/**
 * The privacy gate: everything that must be true before text may go to the cloud.
 *
 *   regex pass  ->  on-device model pass (optional)  ->  regex pass again  ->  leak check
 *
 * Running the regex pass FIRST means the on-device model never even has
 * structured personal data (emails, phones, card numbers) in front of it when
 * it rewrites the text, so it cannot reintroduce any. The model's job is the
 * part regex cannot do well: names and addresses written in free prose.
 *
 * If anything looks wrong, the gate closes: `safeToSend` is false and the
 * router keeps the verdict local.
 */
import { countTags, findLeaks, regexRedact } from './regex';

export interface RedactionOutcome {
  /** The text that may be sent. Only meaningful when `safeToSend` is true. */
  text: string;
  /** Number of redaction tags in the final text. */
  redactionCount: number;
  /** Whether the on-device model contributed to the redaction. */
  usedModel: boolean;
  /** False when the leak check failed and the text must stay on the device. */
  safeToSend: boolean;
}

/**
 * A model-backed redactor. Receives text that has already been through the
 * regex pass and returns a rewrite with remaining personal details replaced by
 * tags. Returns null when it cannot produce a valid result.
 */
export type ModelRedactor = (preRedacted: string) => Promise<string | null>;

/** A model rewrite must stay roughly the same size. Anything else is a summary or a ramble. */
function plausibleRewrite(before: string, after: string): boolean {
  if (after.trim().length === 0) return false;
  const ratio = after.length / Math.max(1, before.length);
  return ratio >= 0.5 && ratio <= 1.3;
}

export async function redactForCloud(original: string, modelRedactor?: ModelRedactor | null): Promise<RedactionOutcome> {
  const first = regexRedact(original);
  let candidate = first.text;
  let usedModel = false;

  if (modelRedactor) {
    try {
      const rewritten = await modelRedactor(first.text);
      if (rewritten && plausibleRewrite(first.text, rewritten)) {
        // Second regex pass over the model's output, in case it produced anything pattern-shaped.
        candidate = regexRedact(rewritten).text;
        usedModel = true;
      }
    } catch {
      // A failed model redaction is not an error: the regex pass already ran.
    }
  }

  const clean = (text: string) => findLeaks(text, first.found).length === 0 && regexRedact(text).total === 0;

  if (clean(candidate)) {
    return { text: candidate, redactionCount: countTags(candidate), usedModel, safeToSend: true };
  }

  // The model's rewrite did not pass. Fall back to the regex-only text.
  if (usedModel) {
    const regexOnly = regexRedact(first.text).text;
    if (clean(regexOnly)) {
      return { text: regexOnly, redactionCount: countTags(regexOnly), usedModel: false, safeToSend: true };
    }
  }

  // Still not clean. Close the gate.
  return { text: '', redactionCount: 0, usedModel: false, safeToSend: false };
}
