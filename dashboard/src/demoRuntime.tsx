/**
 * "Try it without installing anything."
 *
 * On the hosted practice pages this runs the extension's real content script,
 * router, redaction and UI as an ordinary web script. Inference still goes
 * through Firebase AI Logic: on the visitor's device when their Chrome has
 * Gemini Nano, otherwise the cloud path after redaction. App Check uses
 * reCAPTCHA Enterprise here, since this is a normal web origin.
 *
 * If the real extension is installed it answers a ping and this script stands
 * down, so the two never draw over each other.
 *
 * What the web version cannot do: pause downloads, tell a family member, or
 * remember settings. Those need the extension.
 */
import { configured } from './firebase'; // first: App Check must be set up before any AI call
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { AiEngine } from '../../src/inference/engine';
import { firebaseEngine } from '../../src/inference/firebaseEngine';
import { assess, type AssessInput } from '../../src/inference/router';
import type { ContentScriptContext } from './wxtShim';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** With no Firebase config in this build the demo still works, on built-in rules. */
const rulesOnly: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: () => Promise.reject(new Error('not configured')),
  redactOnDevice: () => Promise.reject(new Error('not configured')),
  analyzeInCloud: () => Promise.reject(new Error('not configured')),
};

/**
 * When the AI check could not run here (no Firebase config, the browser could not be confirmed
 * by App Check, or the cloud was busy), say so on the page, so a quiet page is never mistaken
 * for "Tripwire checked this and it was fine".
 */
function noteRulesOnly(): void {
  if (document.getElementById('tripwire-demo-note')) return;
  const note = document.createElement('p');
  note.id = 'tripwire-demo-note';
  note.className = 'demo-note';
  note.setAttribute('role', 'status');
  note.textContent =
    'The AI check could not run in this browser just now, so Tripwire used only its built-in rules, which catch fewer scams. With the extension, or in a moment, the full check runs.';
  document.body.append(note);
}

async function extensionIsHere(): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (value: boolean) => {
      window.removeEventListener('tripwire-pong', onPong);
      resolve(value);
    };
    const onPong = () => done(true);
    window.addEventListener('tripwire-pong', onPong);
    window.dispatchEvent(new CustomEvent('tripwire-ping'));
    setTimeout(() => done(false), 500);
  });
}

async function start(): Promise<void> {
  if (document.readyState !== 'complete') await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  const callPage = document.body.dataset.tripwirePage === 'call';
  if (!callPage) {
    await wait(700); // give an installed extension time to load its content script
    if (await extensionIsHere()) return;
  }

  const continued = new Set<string>();
  const engine = configured ? firebaseEngine : rulesOnly;

  // The handful of extension APIs the content script touches, answered in the page.
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getURL: (path: string) => path,
      onMessage: { addListener: () => undefined },
      sendMessage: async (message: { type: string; input?: AssessInput; page?: string; outcome?: string }) => {
        switch (message.type) {
          case 'assess': {
            const verdict = await assess(message.input!, { engine, config: DEFAULT_CONFIG });
            if (verdict.route === 'rules_only') noteRulesOnly();
            return { verdict, acknowledged: continued.has(message.page ?? '') };
          }
          case 'outcome':
            if (message.outcome === 'continued') continued.add(message.page ?? '');
            return { ok: true };
          case 'transfer-risk':
            return { recent: false };
          case 'leave':
            location.href = '/stopped.html';
            return { ok: true };
          default:
            return { ok: true };
        }
      },
    },
    i18n: { getUILanguage: () => navigator.language },
  };

  if (callPage) {
    // The extension's own call-check page, answered by the same in-page router.
    await import('../../src/entrypoints/call/main');
    document.documentElement.dataset.tripwireDemo = 'web';
    return;
  }

  const context: ContentScriptContext = {
    isValid: true,
    addEventListener: (target, type, handler, options) => target.addEventListener(type, handler, options),
    onInvalidated: () => undefined,
  };
  const script = (await import('../../src/entrypoints/content/index')).default as unknown as { main: (ctx: ContentScriptContext) => void };
  script.main(context);
  document.documentElement.dataset.tripwireDemo = 'web';
}

void start();
