/**
 * Reading the page, carefully.
 *
 *  - Only text the person can actually see (innerText skips hidden content and
 *    never includes what is typed into form fields, passwords included).
 *  - In Gmail, only emails that have been opened. Never the inbox list.
 *  - Size-limited, debounced, and de-duplicated so a page is not re-checked
 *    unless its text really changed.
 */

const MAX_CHARS = 20_000;
const GMAIL_HOST = 'mail.google.com';

/** Gmail's message body and subject containers. Stable for years; verified selectors live here only. */
const GMAIL_BODY = 'div.a3s';
const GMAIL_SUBJECT = 'h2.hP';

export function isGmail(hostname: string): boolean {
  return hostname === GMAIL_HOST;
}

function clean(text: string): string {
  return text.replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Text of the emails currently open in Gmail, or '' when none is open. */
function gmailOpenedText(doc: Document): string {
  const bodies = Array.from(doc.querySelectorAll<HTMLElement>(GMAIL_BODY)).filter((el) => el.offsetParent !== null);
  if (bodies.length === 0) return '';
  const subject = doc.querySelector<HTMLElement>(GMAIL_SUBJECT)?.innerText ?? '';
  return [subject, ...bodies.map((b) => b.innerText)].join('\n');
}

/** The visible text worth checking, or '' when there is nothing to check yet. */
export function readVisibleText(doc: Document = document): string {
  try {
    const raw = isGmail(doc.location.hostname) ? gmailOpenedText(doc) : (doc.body?.innerText ?? '');
    return clean(raw).slice(0, MAX_CHARS);
  } catch {
    return '';
  }
}

/** Small, fast, non-cryptographic hash for change detection. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ScanScheduler {
  /** Ask for a scan soon; calls collapse together. */
  request(): void;
  stop(): void;
}

/**
 * Debounced, budgeted scan loop. `onText` is called with page text only when
 * the text differs from the last scan.
 */
export function createScanScheduler(
  onText: (text: string) => void,
  opts: { debounceMs?: number; minIntervalMs?: number; maxScans?: number; minChars?: number } = {},
): ScanScheduler {
  const debounceMs = opts.debounceMs ?? 1200;
  const minIntervalMs = opts.minIntervalMs ?? 4000;
  const maxScans = opts.maxScans ?? 8;
  const minChars = opts.minChars ?? 80;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastHash = 0;
  let lastAt = 0;
  let scans = 0;
  let stopped = false;

  const run = () => {
    if (stopped || scans >= maxScans) return;
    const text = readVisibleText();
    if (text.length < minChars) return;
    // Digits are ignored so a ticking countdown does not look like new content.
    const h = hashText(text.replace(/\d+/g, '#'));
    if (h === lastHash) return;
    lastHash = h;
    lastAt = Date.now();
    scans += 1;
    try {
      onText(text);
    } catch {
      // A failed scan must never surface on the host page.
    }
  };

  return {
    request() {
      // A pending scan is left alone rather than pushed back: a page that
      // changes every second (a countdown) must not postpone its own check forever.
      if (stopped || timer) return;
      const wait = Math.max(debounceMs, minIntervalMs - (Date.now() - lastAt));
      timer = setTimeout(
        () => {
          timer = undefined;
          run();
        },
        lastAt === 0 ? debounceMs : wait,
      );
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
