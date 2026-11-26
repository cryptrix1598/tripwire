/**
 * The privacy gate: everything that must be true before text may go to the cloud.
 *
 *   regex pass  ->  on-device model pass (optional)  ->  regex pass again  ->  leak check
 *
 * Running the regex pass FIRST means the on-device model never even has
 * structured personal data (emails, phones, card numbers) in front of it, so it
 * cannot reintroduce any. The model's job is the part regex cannot do well:
 * pointing at names and addresses written in free prose, which the router then
 * replaces with tags (the model never writes the text itself).
 *
 * Once the on-device model has answered, its findings are never thrown away:
 * if its output is unusable or does not pass the leak check, the gate closes
 * (`safeToSend` is false) and the router keeps the verdict local. Sending the
 * regex-only text instead would send the names the model had just found.
 * Only when no model is available, or it failed to answer at all, is the
 * regex-only text sent.
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
 * regex pass and returns it with remaining personal details replaced by tags.
 * Returns null when the model could not give a valid answer at all.
 */
export type ModelRedactor = (preRedacted: string) => Promise<string | null>;

/**
 * Tags can make the text longer (a short name becomes "[NAME]") or a little
 * shorter (a long address becomes "[ADDRESS]"), so only a result that lost most
 * of the text is refused: that is a summary, not a redaction.
 */
function usableResult(before: string, after: string): boolean {
  return after.trim().length > 0 && after.length >= before.length * 0.5;
}

const CLOSED: RedactionOutcome = { text: '', redactionCount: 0, usedModel: false, safeToSend: false };

export async function redactForCloud(original: string, modelRedactor?: ModelRedactor | null): Promise<RedactionOutcome> {
  const first = regexRedact(original);
  let candidate = first.text;
  let usedModel = false;

  if (modelRedactor) {
    let rewritten: string | null = null;
    try {
      rewritten = await modelRedactor(first.text);
    } catch {
      // A model that failed to answer is the same as no model: the regex pass already ran.
    }
    if (rewritten !== null) {
      // The model answered. Its findings must not be dropped, so an unusable answer closes the gate.
      if (!usableResult(first.text, rewritten)) return CLOSED;
      // Second regex pass over the model's output, in case it produced anything pattern-shaped.
      candidate = regexRedact(rewritten).text;
      usedModel = true;
    }
  }

  const clean = (text: string) => findLeaks(text, first.found).length === 0 && regexRedact(text).total === 0;

  if (clean(candidate)) {
    return { text: candidate, redactionCount: countTags(candidate), usedModel, safeToSend: true };
  }

  // Not clean. Close the gate (never fall back to text without the model's findings).
  return CLOSED;
}
