/**
 * Development-only screen gallery: `npm run dev:dashboard`, then open
 * /preview.html?page=pause|banner|alerts|pair|popup|onboarding|safe
 *
 * It renders the real components with invented sample data and a stand-in for
 * the extension APIs, so screens can be reviewed without loading the extension.
 * It is not part of the built dashboard or the extension.
 */
import '../../src/ui/fonts.css';
import '../../src/ui/tripwire.css';
import { Timestamp } from 'firebase/firestore';
import { createRoot } from 'react-dom/client';
import type { Verdict } from '../../src/inference/schemas';
import type { StatusReply } from '../../src/messaging';
import { Banner } from '../../src/ui/Banner';
import { ALERT_SUMMARY, DASHBOARD } from '../../src/ui/copy';
import { Brand } from '../../src/ui/kit';
import { Pause } from '../../src/ui/Pause';
import { AlertRow, Pair } from './App';

const params = new URLSearchParams(location.search);
const page = params.get('page') ?? 'pause';

const verdict: Verdict = {
  state: page === 'banner' ? 'caution' : 'tripped',
  riskScore: 88,
  scamType: 'bank_impersonation',
  redFlags: [
    'It threatens to suspend your account unless you act immediately.',
    'It asks for your card number and a one-time passcode.',
    'It tells you not to contact your own bank branch.',
  ],
  explanation: '',
  confidence: 0.9,
  route: (params.get('route') as Verdict['route']) ?? 'device_then_cloud',
  trigger: page === 'banner' ? 'passive' : 'card_entry',
  bytesSentToCloud: 412,
  redactionCount: 4,
  failSafe: false,
  cloudUnreachable: false,
  promptVersion: 'v1',
  elapsedMs: 900,
};

const status: StatusReply = {
  firebaseConfigured: true,
  onDevice: (params.get('model') as StatusReply['onDevice']) ?? 'downloadable',
  promptApiInOffscreen: false,
  guardianReady: true,
  guardianCount: 1, pendingGuardians: 0,
  configSource: 'default',
  promptVersion: 'v1',
  thresholds: { low: 30, high: 80, minTripConfidence: 0.6, minCorroboration: 40, rulesOnlyCaution: 60 } as StatusReply['thresholds'],
};

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    getURL: (path: string) => path,
    sendMessage: async (msg: { type: string }) =>
      ({
        'get-status': status,
        'get-tab-state': { verdict: { ...verdict, state: 'caution' }, hostname: 'example.test' },
        'pairing-code': { ok: true, code: '48291375', expiresAt: Date.now() + 900_000 },
      })[msg.type] ?? { ok: true },
  },
  tabs: { query: async () => [{ id: 1, url: 'https://example.test/' }], create: () => undefined, getCurrent: async () => null },
  storage: { local: { get: async () => ({}), set: async () => undefined }, onChanged: { addListener: () => undefined } },
  i18n: { getUILanguage: () => params.get('lang') ?? 'es-ES' },
};

const ago = (hours: number) => Timestamp.fromMillis(Date.now() - hours * 3_600_000);
const alerts = [
  { id: '1', createdAt: ago(0.5), scamType: 'tech_support', summary: ALERT_SUMMARY.tech_support, action: 'remote_download', outcome: 'continued' },
  { id: '2', createdAt: ago(4), scamType: 'bank_impersonation', summary: ALERT_SUMMARY.bank_impersonation, action: 'card_entry', outcome: 'stopped' },
  { id: '3', createdAt: ago(26), scamType: 'gift_card', summary: ALERT_SUMMARY.gift_card, action: 'gift_card', outcome: 'stopped' },
];

const root = document.getElementById('root')!;
const shell = (children: React.ReactNode) => (
  <div className="tw tw-page">
    <header className="tw-top">
      <Brand name={DASHBOARD.title} size={30} />
    </header>
    <main className="tw-content">{children}</main>
  </div>
);

if (page === 'popup' || page === 'onboarding' || page === 'safe' || page === 'checks' || page === 'settings') {
  const pages = {
    settings: () => import('../../src/entrypoints/settings/main'),
    // The Developer checks page as a plain web page: lets the on-device model be
    // exercised in Chrome without loading the extension (scripts/nano-probe.mjs).
    checks: () => import('../../src/entrypoints/checks/main'),
    popup: () => import('../../src/entrypoints/popup/main'),
    onboarding: () => import('../../src/entrypoints/onboarding/main'),
    safe: () => import('../../src/entrypoints/safe/main'),
  };
  void pages[page]();
} else if (page === 'banner') {
  createRoot(root).render(
    <>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '280px 24px', font: '16px/1.6 Arial', color: '#5B6570' }}>
        <p>Sample page content underneath the banner. Everything here is invented.</p>
      </div>
      <Banner verdict={verdict} onDismiss={() => undefined} />
    </>,
  );
} else if (page === 'alerts') {
  createRoot(root).render(
    shell(
      <>
        <h1 className="tw-h1">Mum</h1>
        <ul className="tw-feed">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </ul>
      </>,
    ),
  );
} else if (page === 'pair') {
  createRoot(root).render(shell(<Pair uid="preview" onDone={() => undefined} />));
} else {
  createRoot(root).render(<Pause verdict={verdict} onStop={() => undefined} onContinue={() => undefined} />);
}
