/**
 * The "tripped" state: a full-page pause. Used in the page (inside the Shadow
 * DOM overlay) and on the extension's own paused-download page.
 *
 * Design: one question, one obvious safe action, a quieter way through. Deep
 * blue rather than red; nothing moves. The reasons are one click away, never
 * in the way.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Trigger, Verdict } from '../inference/schemas';
import { INTERSTITIAL, POPUP, TRANSFER, TRIP_LEAD } from './copy';
import { HOLD_MS, HOLD_TRIGGERS, clock, type FamilyDecision } from './hold';
import { send, type HoldReply } from '../messaging';
import { Brand, RouteLine, SentReceipt, byPerson, flagsFor, routeExplanation } from './kit';

/** What the pause is really about. A passive trip still gets the most specific reading we can honestly give. */
function tripFor(verdict: Verdict): Trigger {
  if (verdict.trigger !== 'passive') return verdict.trigger;
  if (verdict.scamType === 'gift_card') return 'gift_card';
  if (verdict.scamType === 'investment_crypto') return 'crypto_wire';
  if (verdict.scamType === 'tech_support') return 'phone_call';
  return 'passive';
}

/** Pauses where a scammer is usually on the phone, talking the person through it. */
const PHONE_TRIGGERS = new Set<Trigger>(['phone_call', 'gift_card', 'crypto_wire', 'remote_download', 'money_transfer']);

export function leadFor(verdict: Verdict): string {
  const trigger = tripFor(verdict);
  // A tech-support page read passively keeps the general opening line.
  return TRIP_LEAD[trigger === 'phone_call' && verdict.trigger === 'passive' ? 'passive' : trigger];
}

/**
 * The hold: when it ends, from the background (so it survives a reload), ticking once a second.
 * Every few seconds it asks again, which is how a family member's answer arrives
 * ("let it go through" ends it; "keep it on hold" adds half an hour).
 * Without an extension (the hosted demo) it is kept in the page.
 */
function useHold(active: boolean, action: Trigger) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [family, setFamily] = useState<{ told: boolean; decision?: FamilyDecision }>({ told: false });
  // How long the clock may show at most: five minutes, plus five for each "wait longer", so it cannot open at "5:01".
  const [cap, setCap] = useState(HOLD_MS);
  const page = typeof location === 'undefined' ? '' : location.href.split('#')[0] + (location.pathname.endsWith('pause.html') ? location.hash : '');
  const local = (prev: number | null, extend: boolean) => (extend ? Math.max(prev ?? Date.now(), Date.now()) + HOLD_MS : prev ?? Date.now() + HOLD_MS);
  const ask = (extend: boolean) => {
    if (extend) setCap((c) => c + HOLD_MS);
    return send<HoldReply>({ target: 'background', type: 'hold', page, extend, action })
      .then((r) => {
        // Measure from the moment the answer arrives.
        setNow(Date.now());
        setEndsAt((prev) => r?.endsAt ?? local(prev, extend));
        if (r) setFamily({ told: r.told === true, ...(r.family ? { decision: r.family } : {}) });
        if (r?.family === 'extended') setCap(Number.MAX_SAFE_INTEGER);
      })
      .catch(() => setEndsAt((prev) => local(prev, extend)));
  };
  useEffect(() => {
    if (!active) return;
    void ask(false);
    let ticks = 0;
    const t = setInterval(() => {
      setNow(Date.now());
      if (++ticks % 5 === 0) void ask(false);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const left = active ? Math.min(cap, endsAt === null ? HOLD_MS : Math.max(0, endsAt - now)) : 0;
  return { left, family, extend: () => void ask(true) };
}

export function Pause({
  verdict,
  onStop,
  onContinue,
  onPhone,
  note,
  heading = 'h1',
}: {
  verdict: Verdict;
  onStop: () => void;
  onContinue: () => void;
  /** Opens the phone-call check. Shown when the pause is about a call, gift cards, crypto or remote access. */
  onPhone?: () => void;
  note?: ReactNode;
  heading?: 'h1' | 'h2';
}) {
  const [open, setOpen] = useState(false);
  const stopRef = useRef<HTMLButtonElement>(null);
  const held = verdict.hold ?? HOLD_TRIGGERS.has(tripFor(verdict));
  const hold = useHold(held, tripFor(verdict));
  const Title = heading;
  const Question = heading === 'h1' ? 'h2' : 'h3';
  const transfer = tripFor(verdict) === 'money_transfer';
  // The one reason most likely to persuade, on the main screen; the rest stay behind "Why".
  const flags = verdict.redFlags.length > 0 ? flagsFor(verdict) : [];
  const [topFlag, ...moreFlags] = flags;

  useEffect(() => {
    stopRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="tw tw-split" role="alertdialog" aria-modal="true" aria-label={INTERSTITIAL.dialogLabel}>
      <div className="tw-split__side">
        <Brand />
        <Title className="tw-h1 tw-h1--xl">{INTERSTITIAL.title}</Title>
        {verdict.route !== 'not_checked' ? (
          <RouteLine route={verdict.route} sent={verdict.bytesSentToCloud > 0} wrongSide={verdict.wrongSide} downloading={verdict.modelDownloading} />
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
      <div className="tw-split__main">
        <div className="tw-stack">
          <p className="tw-lead">{leadFor(verdict)}</p>
          {topFlag && (
            <p className="tw-topflag" lang={verdict.explanationLanguage}>
              <span className="tw-topflag__label">{INTERSTITIAL.noticed}</span>
              <span>{topFlag}</span>
            </p>
          )}
          <Question className="tw-h2">{transfer ? TRANSFER.question : INTERSTITIAL.question}</Question>
          <p className="tw-body">{transfer ? TRANSFER.reassurance : INTERSTITIAL.reassurance}</p>
          {note}
          <div className="tw-col-start">
            <button ref={stopRef} type="button" className="tw-btn tw-btn--xl" onClick={byPerson(onStop)}>
              {INTERSTITIAL.primary}
            </button>
            {held && hold.family.decision && (
              <p className="tw-hold__family" role="status">
                {hold.family.decision === 'released' ? INTERSTITIAL.holdFamilyReleased : INTERSTITIAL.holdFamilyExtended}
              </p>
            )}
            {held && hold.left > 0 ? (
              <>
                <p className="tw-hold__wait" aria-live="off">{INTERSTITIAL.holdWait(clock(hold.left))}</p>
                {hold.family.told && !hold.family.decision && <p className="tw-muted">{INTERSTITIAL.holdFamilyTold}</p>}
                <button type="button" className="tw-link" onClick={byPerson(hold.extend)}>
                  {INTERSTITIAL.holdLonger}
                </button>
              </>
            ) : (
              <button type="button" className="tw-link" onClick={byPerson(onContinue)}>
                {INTERSTITIAL.secondary}
              </button>
            )}
          </div>
          {/* After the safe button, so "Stop" stays on screen on short laptops. */}
          {held && (
            <div className="tw-hold" role="note">
              <p className="tw-hold__lead">{INTERSTITIAL.holdLead}</p>
              <p>{INTERSTITIAL.holdHangUp}</p>
              <p>{INTERSTITIAL.holdCall}</p>
            </div>
          )}
          {onPhone && PHONE_TRIGGERS.has(tripFor(verdict)) && (
            <button type="button" className="tw-btn tw-btn--outline" onClick={byPerson(onPhone)} style={{ alignSelf: 'flex-start' }}>
              {POPUP.callCheck}
            </button>
          )}
          <div className="tw-rule">
            <button type="button" className="tw-link tw-link--strong" aria-expanded={open} onClick={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }}>
              {open ? INTERSTITIAL.hideWhy : INTERSTITIAL.why}
            </button>
            {open && (
              <>
                {verdict.explanation && <p lang={verdict.explanationLanguage}>{verdict.explanation}</p>}
                <ul className="tw-flags" lang={verdict.explanationLanguage}>
                  {(topFlag ? moreFlags : flagsFor(verdict)).map((flag) => (
                    <li key={flag}>
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
                <p className="tw-muted">{routeExplanation(verdict)}</p>
                <SentReceipt verdict={verdict} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
