/** Small shared pieces used by every Tripwire surface. */
import { useState, type ReactNode } from 'react';
import type { Route, Verdict } from '../inference/schemas';
import { BRAND, DECIDED_BY, ROUTE_BADGE, WHY } from './copy';

/** The Tripwire mark: two posts joined by a wire. */
export function Mark({ size = 32, color = '#8DAEF5', label }: { size?: number; color?: string; label?: string }) {
  return (
    <svg
      className="tw-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <line x1="6" y1="8" x2="6" y2="24" />
      <line x1="26" y1="8" x2="26" y2="24" />
      <line x1="6" y1="16" x2="26" y2="16" />
      <circle cx="16" cy="16" r="2.5" fill={color} stroke="none" />
    </svg>
  );
}

export function Brand({ name = BRAND.name, size = 32 }: { name?: string; size?: number }) {
  return (
    <div className="tw-brand">
      <Mark size={size} />
      <span>{name}</span>
    </div>
  );
}

/**
 * Wrap a button handler so that only a real click or key press counts. A page
 * script can reach into the page's DOM and call .click() on a button; the
 * browser marks such events as untrusted, and Tripwire ignores them. Without
 * this, a scam page could press "I'm sure, continue" for the person.
 */
export function byPerson(handler: () => void) {
  return (event: { isTrusted?: boolean; nativeEvent?: { isTrusted?: boolean } }) => {
    if ((event.nativeEvent?.isTrusted ?? event.isTrusted) === false) return;
    handler();
  };
}

/** What left this device, said the same way everywhere. */
export function RouteLine({ route, sent = false, wrongSide = false, downloading = false }: { route: Route; sent?: boolean; wrongSide?: boolean; downloading?: boolean }) {
  // An unknown route must never break a pause: say only what is certain.
  const badge = ROUTE_BADGE[route] ?? ROUTE_BADGE.rules_only;
  const label = downloading && route === 'cloud_fallback' ? WHY.downloadingLabel : badge.label;
  // A deeper check was tried and got no usable answer: the redacted text did leave (or may have).
  const detail = wrongSide
    ? WHY.wrongSideDetail
    : sent && (badge.tone === 'local' || badge.tone === 'rules')
      ? WHY.attemptedDetail
      : badge.detail;
  return (
    <p className="tw-route">
      <span className={`tw-dot tw-dot--${badge.tone}`} aria-hidden="true" />
      <span>
        <strong>{label}</strong> · {detail}
      </span>
    </p>
  );
}

/** The longer, plain explanation of how a verdict was reached. */
/** "What decided: Gemini Nano, confirmed by the built-in rules." */
export function DecidedBy({ verdict }: { verdict: Verdict }) {
  if (!verdict.decidedBy) return null;
  return (
    <p className="tw-muted">
      <strong>{DECIDED_BY.label}:</strong> {DECIDED_BY[verdict.decidedBy]}
    </p>
  );
}

export function routeExplanation(verdict: Verdict): string {
  if (verdict.wrongSide) return WHY.wrongSide;
  const parts = [verdict.modelDownloading && verdict.route === 'cloud_fallback' ? WHY.downloading : ROUTE_BADGE[verdict.route].long];
  if (verdict.bytesSentToCloud > 0 && verdict.redactionCount > 0) parts.push(WHY.redactions(verdict.redactionCount));
  const attempted = verdict.bytesSentToCloud > 0 && (verdict.route === 'on_device' || verdict.route === 'rules_only');
  if (attempted) parts.push(WHY.attempted);
  else if (verdict.cloudUnreachable) parts.push(WHY.cloudUnreachable);
  return parts.join(' ');
}

/**
 * The privacy receipt: the exact text that left the device, shown on request.
 * The claim "personal info removed" is something the person can check, not
 * something they have to take on trust.
 */
export function SentReceipt({ verdict }: { verdict: Verdict }) {
  const [open, setOpen] = useState(false);
  if (!verdict.sentPreview) return null;
  return (
    <div className="tw-stack tw-stack--tight">
      <button type="button" className="tw-link tw-link--strong" aria-expanded={open} onClick={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }}>
        {open ? WHY.sentHide : WHY.sentShow}
      </button>
      {open && (
        <>
          <p className="tw-small">{WHY.sentNote}</p>
          <div className="tw-sent" role="region" aria-label={WHY.sentLabel} tabIndex={0}>
            {verdict.sentPreview}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * How specific a reason is, so the one shown on the main screen is the one most likely to persuade:
 * a named ask (a PIN, gift cards, a "safe account", remote access) before a vague one ("act now").
 */
const SPECIFIC = [
  /\b(?:pin|password|passcode|one-time|code|social security|ssn|contrase|mot de passe|c[oó]digo)\b/i,
  /\b(?:gift ?cards?|crypto|bitcoin|wire|safe account|secure account|remote|anydesk|teamviewer|tarjetas? de regalo|cartes? cadeaux?)\b/i,
  /\b(?:card number|bank|account|routing|payee|tarjeta|cuenta|carte|compte)\b/i,
  /\b(?:call|phone|number|llam|appel)\w*/i,
];
const specificity = (flag: string) => {
  const i = SPECIFIC.findIndex((re) => re.test(flag));
  return i < 0 ? SPECIFIC.length : i;
};

export function flagsFor(verdict: Verdict): string[] {
  const flags = verdict.redFlags.filter((f) => typeof f === 'string' && f.trim().length > 0).slice(0, 4);
  if (flags.length === 0) return [WHY.noFlags];
  // A transfer's reasons are already in order (the content script puts the strongest first).
  if (verdict.trigger === 'money_transfer') return flags;
  return flags.map((f, i) => ({ f, i, s: specificity(f) })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.f);
}

/** Deep field on the left, calm content on the right. Stacks on narrow screens. */
export function Split({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="tw tw-split">
      <header className="tw-split__side">{side}</header>
      <main className="tw-split__main">
        <div className="tw-stack">{children}</div>
      </main>
    </div>
  );
}

export function Tick({ ok = true }: { ok?: boolean }) {
  return ok ? (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#1c48b0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4,11 9,16 18,6" />
    </svg>
  ) : (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#354a68" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="5" x2="17" y2="17" />
      <line x1="17" y1="5" x2="5" y2="17" />
    </svg>
  );
}

export function NoticeIcon({ color = '#7A2E0E' }: { color?: string }) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ flex: 'none' }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="7" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17.5" />
    </svg>
  );
}
