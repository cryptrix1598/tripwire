/** Small shared pieces used by every Tripwire surface. */
import type { ReactNode } from 'react';
import type { Route, Verdict } from '../inference/schemas';
import { BRAND, ROUTE_BADGE, WHY } from './copy';

/** The Tripwire mark: two posts joined by a wire. */
export function Mark({ size = 32, color = '#F0B429', label }: { size?: number; color?: string; label?: string }) {
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

/** What left this device, said the same way everywhere. */
export function RouteLine({ route }: { route: Route }) {
  const badge = ROUTE_BADGE[route];
  return (
    <p className="tw-route">
      <span className={`tw-dot tw-dot--${badge.tone}`} aria-hidden="true" />
      <span>
        <strong>{badge.label}</strong> · {badge.detail}
      </span>
    </p>
  );
}

/** The longer, plain explanation of how a verdict was reached. */
export function routeExplanation(verdict: Verdict): string {
  const parts = [ROUTE_BADGE[verdict.route].long];
  if (verdict.bytesSentToCloud > 0 && verdict.redactionCount > 0) parts.push(WHY.redactions(verdict.redactionCount));
  if (verdict.cloudUnreachable) parts.push(WHY.cloudUnreachable);
  return parts.join(' ');
}

export function flagsFor(verdict: Verdict): string[] {
  const flags = verdict.redFlags.filter((f) => typeof f === 'string' && f.trim().length > 0).slice(0, 5);
  return flags.length > 0 ? flags : [WHY.noFlags];
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
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#1F6A4B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4,11 9,16 18,6" />
    </svg>
  ) : (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#3F5668" strokeWidth="2.5" strokeLinecap="round">
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
