/**
 * Reading the page, carefully.
 *
 *  - Only text the person can actually see (innerText skips hidden content and
 *    never includes what is typed into form fields, passwords included).
 *  - In webmail (Gmail, Outlook, Yahoo Mail), only a message that has been opened. Never the inbox list.
 *  - Size-limited, debounced, and de-duplicated so a page is not re-checked
 *    unless its text really changed.
 */

const MAX_CHARS = 40_000;
const GMAIL_HOST = 'mail.google.com';

/** Gmail's message body and subject containers. Stable for years; verified selectors live here only. */
const GMAIL_BODY = 'div.a3s';
const GMAIL_SUBJECT = 'h2.hP';

export function isGmail(hostname: string): boolean {
  return hostname === GMAIL_HOST;
}

/**
 * Other webmail: where an opened message's body lives. On these sites nothing
 * is read unless a message is open, so the inbox list is never checked. The selectors are
 * covered by fixture tests (tests/webmail.test.ts); real mailboxes have not been tested.
 */
const WEBMAIL_BODY: Record<string, string> = {
  'outlook.live.com': '[aria-label="Message body"], div[role="document"]',
  'outlook.office.com': '[aria-label="Message body"], div[role="document"]',
  'outlook.office365.com': '[aria-label="Message body"], div[role="document"]',
  'mail.yahoo.com': '[data-test-id="message-view-body"]',
};

export function isWebmail(hostname: string): boolean {
  return hostname === GMAIL_HOST || hostname in WEBMAIL_BODY;
}

/** Where the sender's address can be found in an opened message. Only its domain is ever read. */
const SENDER: Record<string, string> = {
  'mail.google.com': 'span.gD[email]',
  'outlook.live.com': '[aria-label^="From"] [title*="@"], span[title*="@"]',
  'outlook.office.com': '[aria-label^="From"] [title*="@"], span[title*="@"]',
  'outlook.office365.com': '[aria-label^="From"] [title*="@"], span[title*="@"]',
  'mail.yahoo.com': '[data-test-id="message-from"], [data-test-id="email-pill"]',
};

type Visible = (el: HTMLElement) => boolean;
const onScreen: Visible = (el) => el.offsetParent !== null;
const textOf = (el: HTMLElement) => el.innerText ?? el.textContent ?? '';

/**
 * The domain of the opened message's sender, such as "paypa1-support.com". A sender whose
 * domain does not match the company it claims to be is the strongest sign in an email. Only
 * the part after the @ is read, never the person's address.
 */
export function senderDomain(doc: Document, host: string): string {
  const selector = SENDER[host];
  if (!selector) return '';
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
    const raw = el.getAttribute('email') ?? el.getAttribute('title') ?? el.textContent ?? '';
    const domain = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(raw)?.[1];
    if (domain) return domain.toLowerCase();
  }
  return '';
}

function webmailOpenedText(doc: Document, selector: string, visible: Visible): string {
  return Array.from(doc.querySelectorAll<HTMLElement>(selector))
    .filter(visible)
    .map(textOf)
    .join('\n');
}

function clean(text: string): string {
  return text.replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Text of the emails currently open in Gmail, or '' when none is open. */
function gmailOpenedText(doc: Document, visible: Visible): string {
  const bodies = Array.from(doc.querySelectorAll<HTMLElement>(GMAIL_BODY)).filter(visible);
  if (bodies.length === 0) return '';
  const subjectEl = doc.querySelector<HTMLElement>(GMAIL_SUBJECT);
  return [subjectEl ? textOf(subjectEl) : '', ...bodies.map(textOf)].join('\n');
}

/** The visible text worth checking, or '' when there is nothing to check yet. */
export function readVisibleText(doc: Document = document, visible: Visible = onScreen): string {
  try {
    const host = doc.location.hostname;
    const webmail = WEBMAIL_BODY[host];
    const raw = isGmail(host) ? gmailOpenedText(doc, visible) : webmail ? webmailOpenedText(doc, webmail, visible) : (doc.body?.innerText ?? '');
    if (!raw.trim()) return '';
    // For an opened email, say where it really came from (the domain only).
    const from = isWebmail(host) ? senderDomain(doc, host) : '';
    return clean(from ? `Sender's address is at: ${from}\n${raw}` : raw).slice(0, MAX_CHARS);
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
  /** A new page in the same tab: forget what was seen and start the budget again. */
  reset(): void;
  stop(): void;
  /** True while a scan is waiting to run: the page changed and has not been read again yet. */
  pending(): boolean;
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
  let refilledAt = Date.now();
  let stopped = false;

  const run = () => {
    if (stopped) return;
    // The budget refills (one scan every 20 seconds), so a page cannot burn through it
    // with harmless changes and then show its real content unchecked.
    const now = Date.now();
    scans = Math.max(0, scans - Math.floor((now - refilledAt) / 20_000));
    if (now - refilledAt >= 20_000) refilledAt = now;
    if (scans >= maxScans) {
      // Out of budget for the moment: look again when the next scan is earned.
      if (!timer) timer = setTimeout(() => { timer = undefined; run(); }, 20_000);
      return;
    }
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
    reset() {
      scans = 0;
      lastHash = 0;
      lastAt = 0;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    pending() {
      return !stopped && timer !== undefined;
    },
  };
}
