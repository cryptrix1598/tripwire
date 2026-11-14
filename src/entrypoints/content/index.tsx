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
import { createScanScheduler, isGmail, readVisibleText } from '../../content/scan';
import type { Trigger, Verdict } from '../../inference/schemas';
import { send, type AssessReply, type ToContent } from '../../messaging';
import { describeField, isCardField, mayInspectValue, valueIsCardNumber } from '../../tripwires/cardField';
import { Banner } from '../../ui/Banner';
import { Pause } from '../../ui/Pause';

const MAX_TEXT = 20_000;
const ACTION_COOLDOWN_MS = 8_000;
const GIFT_FIELD = /gift\s*-?\s*card|card\s*(?:pin|code)|claim\s*code|redemption\s*code|voucher\s*code|itunes|google\s*play\s*code|steam\s*(?:wallet|code)/i;
const WALLET_FIELD = /wallet|bitcoin|\bbtc\b|\beth(?:ereum)?\b|\busdt\b|crypto|recipient\s*address/i;

type View = { kind: 'none' } | { kind: 'banner'; verdict: Verdict } | { kind: 'pause'; verdict: Verdict };

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

  let view: View = { kind: 'none' };
  const listeners = new Set<() => void>();
  let last: Verdict | null = null;
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
    if (v.kind === 'pause') {
      return (
        <div className="tw-overlay">
          <Pause heading="h2" verdict={v.verdict} onStop={stop} onContinue={proceed} />
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
    const reply = await send<AssessReply>({ target: 'background', type: 'assess', input: { text, hostname, trigger }, page: pageKey() });
    return ctx.isValid ? reply : null;
  }

  async function onPageText(): Promise<void> {
    const reply = await assess('passive');
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

  const scheduler = createScanScheduler(() => void onPageText().catch(() => undefined), { maxScans: gmail ? 60 : 8 });

  ctx.addEventListener(
    document,
    'focusin',
    (event) => {
      try {
        const el = event.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
        const info = describeField(el);
        if (info.type.toLowerCase() === 'password') return;
        if (isCardField(info)) return void onAction('card_entry');
        const hay = [info.name, info.id, info.placeholder, info.ariaLabel, info.labelText].join(' ');
        if (GIFT_FIELD.test(hay)) return void onAction('gift_card');
        if (WALLET_FIELD.test(hay)) return void onAction('crypto_wire');
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
        if (!(target instanceof Element) || !target.closest('a[href^="tel:" i]')) return;
        void onAction('phone_call', event);
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

  const observer = new MutationObserver(() => {
    if (location.href !== href) {
      // Same tab, new page (Gmail, single-page sites): start from a clean slate.
      href = location.href;
      dismissed = false;
      acknowledged = false;
      last = null;
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
