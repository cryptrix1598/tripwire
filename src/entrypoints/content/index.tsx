/**
 * Content script: watches the page, and steps in.
 *
 *  - Safe: nothing is added to the page at all.
 *  - Caution: a calm banner (Shadow DOM, so the page cannot restyle it).
 *  - Tripped: a full-page pause.
 *
 * Rules this file keeps:
 *  - It never reads password fields, and never reads content that is not on screen.
 *  - Typed values are only ever tested locally (is this a card number?), never sent.
 *  - Every handler is wrapped: a Tripwire error must never break the host page.
 */
import '../../ui/tripwire.css';
import { useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi, defineContentScript, type ContentScriptContext } from '#imports';
import { createScanScheduler, isGmail, isWebmail, readVisibleText } from '../../content/scan';
import { demoUrl } from '../../firebase/config';
import type { Trigger, Verdict } from '../../inference/schemas';
import { send, type AssessReply, type ToContent } from '../../messaging';
import { describeField, isCardField, mayInspectValue, valueIsCardNumber } from '../../tripwires/cardField';
import { Banner } from '../../ui/Banner';
import { BANNER } from '../../ui/copy';
import { applyLocale } from '../../ui/locale';
import { Pause } from '../../ui/Pause';

const MAX_TEXT = 40_000;
/** Where the practice pages live: the hosted demo, and a developer's own machine. */
const PRACTICE_HOSTS = new Set(['localhost', '127.0.0.1', safeHost(demoUrl)]);
function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}
const ACTION_COOLDOWN_MS = 8_000;
const GIFT_FIELD = /gift\s*-?\s*card|card\s*(?:pin|code)|claim\s*code|redemption\s*code|voucher\s*code|itunes|google\s*play\s*code|steam\s*(?:wallet|code)/i;
const WALLET_FIELD = /wallet|bitcoin|\bbtc\b|\beth(?:ereum)?\b|\busdt\b|crypto|recipient\s*address/i;

type View =
  | { kind: 'none' }
  | { kind: 'checking'; what: 'call' | 'card' | 'code' }
  | { kind: 'banner'; verdict: Verdict }
  | { kind: 'pause'; verdict: Verdict };

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  main(ctx) {
    try {
      if (window.top === window) startTopFrame(ctx);
      else startSubFrame(ctx);
    } catch {
      // Never surface on the host page.
    }
  },
});

/** Embedded frames (payment iframes) only report that a card field was focused. */
function startSubFrame(ctx: ContentScriptContext): void {
  let told = 0;
  ctx.addEventListener(
    document,
    'focusin',
    (event) => {
      try {
        const el = event.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
        if (!isCardField(describeField(el)) || Date.now() - told < ACTION_COOLDOWN_MS) return;
        told = Date.now();
        void send({ target: 'background', type: 'frame-card-intent' });
      } catch {
        /* ignore */
      }
    },
    { capture: true, passive: true },
  );
}

function startTopFrame(ctx: ContentScriptContext): void {
  const hostname = location.hostname;
  const gmail = isGmail(hostname);
  /** The browser's own language. When it is not English, the reasons are written in it. */
  let uiLanguage: string | undefined;
  try {
    uiLanguage = chrome.i18n.getUILanguage();
  } catch {
    uiLanguage = undefined;
  }
  // Banner, pause and reasons in the browser's language when Tripwire has it (English otherwise).
  const locale = applyLocale(uiLanguage);

  let view: View = { kind: 'none' };
  const listeners = new Set<() => void>();
  let last: Verdict | null = null;
  /** Page scans sent and not yet answered. */
  let scansInFlight = 0;
  let acknowledged = false;
  let dismissed = false;
  let href = location.href;
  let unlock: (() => void) | null = null;
  let uiReady: Promise<{ shadowHost: HTMLElement }> | null = null;
  const lastAction = new Map<Trigger, number>();

  /** This exact page, without the query string (which can carry personal details). */
  const pageKey = () => location.origin + location.pathname + location.hash;

  const setView = (next: View) => {
    view = next;
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };

  function App() {
    const v = useSyncExternalStore(subscribe, () => view);
    if (v.kind === 'banner') return <Banner verdict={v.verdict} onDismiss={dismiss} />;
    if (v.kind === 'checking') {
      return (
        <div className="tw tw-checking" role="status">
          {v.what === 'call' ? BANNER.checkingCall : v.what === 'card' ? BANNER.checkingCard : BANNER.checkingCode}
        </div>
      );
    }
    if (v.kind === 'pause') {
      return (
        <div className="tw-overlay">
          <Pause heading="h2" verdict={v.verdict} onStop={stop} onContinue={proceed} onPhone={() => void send({ target: 'background', type: 'open-call' })} />
        </div>
      );
    }
    return null;
  }

  /** The UI is only attached to the page the first time there is something to say. */
  function ensureUi(): Promise<{ shadowHost: HTMLElement }> {
    uiReady ??= (async () => {
      loadFonts();
      const ui = await createShadowRootUi<Root>(ctx, {
        name: 'tripwire-ui',
        position: 'inline',
        anchor: 'body',
        append: 'last',
        isolateEvents: true,
        // The release build closes the shadow root, so the page's own scripts cannot read the pause
        // or the "what was sent" receipt. Development and test builds keep it open, because the
        // browser tests and the accessibility audit need to reach inside it.
        mode: import.meta.env.MODE === 'store' ? 'closed' : 'open',
        onMount(container) {
          const root = createRoot(container);
          root.render(<App />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      ui.mount();
      ui.shadowHost.lang = locale;
      return ui;
    })();
    return uiReady;
  }

  function lockPage(host: Element): void {
    if (unlock) return;
    const touched: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === host || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      touched.push(el);
    }
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    unlock = () => {
      touched.forEach((el) => el.removeAttribute('inert'));
      document.documentElement.style.overflow = previous;
      unlock = null;
    };
  }

  function show(next: View): void {
    void ensureUi()
      .then((ui) => {
        if (next.kind === 'pause') lockPage(ui.shadowHost);
        else unlock?.();
        setView(next);
      })
      .catch(() => undefined);
  }

  // A hostile page can try to delete the warning or undo the lock. While something is
  // showing, put it back; if the page keeps fighting, hand the pause to an extension
  // page the site cannot touch.
  let tampering = 0;
  const guard = setInterval(() => {
    if (view.kind === 'none' || !uiReady) return;
    void uiReady.then((ui) => {
      const host = ui.shadowHost;
      const hidden = host.isConnected && getComputedStyle(host).display === 'none';
      if (!host.isConnected || hidden) {
        tampering += 1;
        host.removeAttribute('style');
        host.hidden = false;
        (document.body ?? document.documentElement).append(host);
      }
      if (view.kind === 'pause') {
        const unlocked = Array.from(document.body?.children ?? []).some((el) => el !== host && !el.hasAttribute('inert'));
        if (unlocked) {
          unlock?.();
          lockPage(host);
        }
        if (tampering >= 3) {
          tampering = 0;
          void send({ target: 'background', type: 'takeover', verdict: view.verdict, page: pageKey(), hostname });
        }
      }
    });
  }, 400);
  ctx.onInvalidated(() => clearInterval(guard));

  /**
   * While a held action waits for its check, say so. A check can take several seconds, and a
   * click that seems to do nothing looks broken. Shown only if the wait is long enough to notice.
   */
  function whileChecking<T>(what: 'call' | 'card' | 'code', job: Promise<T>): Promise<T> {
    let done = false;
    const timer = setTimeout(() => {
      void ensureUi()
        .then(() => {
          if (!done && view.kind === 'none') setView({ kind: 'checking', what });
        })
        .catch(() => undefined);
    }, 350);
    return job.finally(() => {
      done = true;
      clearTimeout(timer);
      if (view.kind === 'checking') setView({ kind: 'none' });
    });
  }

  function hide(): void {
    unlock?.();
    if (view.kind !== 'none') setView({ kind: 'none' });
  }

  function dismiss(): void {
    dismissed = true;
    hide();
  }

  function report(verdict: Verdict, outcome: 'stopped' | 'continued') {
    return send({ target: 'background', type: 'outcome', scamType: verdict.scamType, trigger: verdict.trigger, outcome, hostname, page: pageKey() });
  }

  function stop(): void {
    if (view.kind !== 'pause') return;
    const verdict = view.verdict;
    void report(verdict, 'stopped').then(() => {
      if (gmail) {
        // Close the message rather than throwing the person out of their mailbox.
        hide();
        last = null;
        location.hash = '#inbox';
      } else {
        void send({ target: 'background', type: 'leave' });
      }
    });
  }

  function proceed(): void {
    if (view.kind !== 'pause') return;
    acknowledged = true;
    void report(view.verdict, 'continued');
    hide();
  }

  async function assess(trigger: Trigger): Promise<AssessReply | null> {
    const text = readVisibleText().slice(0, MAX_TEXT);
    const reply = await send<AssessReply>({ target: 'background', type: 'assess', input: { text, hostname, trigger, language: uiLanguage }, page: pageKey() });
    return ctx.isValid ? reply : null;
  }

  async function onPageText(): Promise<void> {
    scansInFlight += 1;
    const reply = await assess('passive').finally(() => {
      scansInFlight -= 1;
    });
    if (!reply) return;
    last = reply.verdict;
    acknowledged = reply.acknowledged;
    if (view.kind === 'pause') return;
    const v = reply.verdict;
    if (v.state === 'tripped' && !acknowledged) show({ kind: 'pause', verdict: v });
    else if (v.state !== 'safe' && !dismissed) show({ kind: 'banner', verdict: v });
    else hide();
  }

  /** The person is about to act. If the page already looked wrong, pause now; otherwise ask. */
  async function onAction(trigger: Trigger, event?: Event): Promise<void> {
    if (acknowledged || view.kind === 'pause') return;
    const now = Date.now();
    if (now - (lastAction.get(trigger) ?? 0) < ACTION_COOLDOWN_MS) return;
    lastAction.set(trigger, now);

    if (last && last.state !== 'safe') {
      event?.preventDefault();
      show({ kind: 'pause', verdict: { ...last, state: 'tripped', trigger } });
    }
    const reply = await assess(trigger);
    if (!reply || acknowledged) return;
    if (reply.acknowledged) {
      acknowledged = true;
      hide();
      return;
    }
    if (reply.verdict.state === 'tripped') show({ kind: 'pause', verdict: reply.verdict });
  }

  const scheduler = createScanScheduler(() => void onPageText().catch(() => undefined), { maxScans: isWebmail(hostname) ? 60 : 8 });

  ctx.addEventListener(
    document,
    'focusin',
    (event) => {
      try {
        const el = event.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
        const info = describeField(el);
        if (info.type.toLowerCase() === 'password') return;
        // If this page has not been judged yet, or it changed since it was judged, the field is
        // held (read-only) until the check answers, so a card number, gift card code or wallet
        // address cannot be typed first. The check itself is bounded by the router's timeouts;
        // the cap here is only a backstop so a field is never stuck.
        const held = (trigger: Trigger, what: 'card' | 'code') => {
          const unjudged = !last || scansInFlight > 0 || scheduler.pending();
          const hold = unjudged && !acknowledged && !el.readOnly;
          if (hold) el.readOnly = true;
          const release = () => {
            if (hold) el.readOnly = false;
          };
          const limit = setTimeout(release, 40_000);
          const check = onAction(trigger);
          void (hold ? whileChecking(what, check) : check).finally(() => {
            clearTimeout(limit);
            release();
          });
        };
        if (isCardField(info)) return held('card_entry', 'card');
        const hay = [info.name, info.id, info.placeholder, info.ariaLabel, info.labelText].join(' ');
        if (GIFT_FIELD.test(hay)) return held('gift_card', 'code');
        if (WALLET_FIELD.test(hay)) return held('crypto_wire', 'code');
      } catch {
        /* ignore */
      }
    },
    { capture: true, passive: true },
  );

  ctx.addEventListener(
    document,
    'input',
    (event) => {
      try {
        const el = event.target;
        if (!(el instanceof HTMLInputElement)) return;
        if (!mayInspectValue(el.type) || !valueIsCardNumber(el.value)) return;
        void onAction('card_entry');
      } catch {
        /* ignore */
      }
    },
    { capture: true, passive: true },
  );

  ctx.addEventListener(
    document,
    'click',
    (event) => {
      try {
        const target = event.target;
        const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href^="tel:" i]') : null;
        if (!link) return;
        if (acknowledged || view.kind === 'pause') return;
        // Already checking for an earlier click: keep holding, do not start a second check.
        if (view.kind === 'checking') return void event.preventDefault();
        if (last && last.state !== 'safe') return void onAction('phone_call', event);
        // Hold the call until the page AS IT IS NOW has been checked, so the dialer cannot open first
        // (a page may have changed since it was last read).
        event.preventDefault();
        const href = link.href;
        void whileChecking('call', assess('phone_call')).then((reply) => {
          if (reply?.verdict.state === 'tripped' && !reply.acknowledged) show({ kind: 'pause', verdict: reply.verdict });
          else location.href = href;
        });
      } catch {
        /* ignore */
      }
    },
    { capture: true },
  );

  chrome.runtime.onMessage.addListener((msg: ToContent) => {
    if (msg?.target === 'content' && msg.type === 'card-intent-in-frame') void onAction('card_entry');
    return false;
  });

  // The hosted practice pages ask whether the extension is here before running their own copy.
  // Answered ONLY there: on any other site a page must not be able to find out that Tripwire is installed.
  if (PRACTICE_HOSTS.has(hostname)) {
    ctx.addEventListener(window, 'tripwire-ping', () => window.dispatchEvent(new CustomEvent('tripwire-pong')));
  }

  const observer = new MutationObserver(() => {
    if (location.href !== href) {
      // Same tab, new page (Gmail, single-page sites): start from a clean slate.
      href = location.href;
      dismissed = false;
      acknowledged = false;
      last = null;
      scheduler.reset(); // a single-page site gets a fresh scan budget for each page
      if (view.kind === 'banner') hide();
    }
    scheduler.request();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  ctx.addEventListener(document, 'visibilitychange', () => {
    if (!document.hidden) scheduler.request();
  });
  ctx.onInvalidated(() => {
    observer.disconnect();
    scheduler.stop();
    unlock?.();
  });

  scheduler.request();
}

/** Shadow DOM cannot declare fonts, so they are registered on the document. Falls back to system fonts. */
function loadFonts(): void {
  try {
    for (const weight of ['400', '700']) {
      const url = chrome.runtime.getURL(`/fonts/atkinson-${weight}.woff2`);
      const face = new FontFace('Atkinson Hyperlegible', `url(${url}) format('woff2')`, { weight, display: 'swap' });
      void face
        .load()
        .then((loaded) => document.fonts.add(loaded))
        .catch(() => undefined);
    }
  } catch {
    /* system fonts */
  }
}
