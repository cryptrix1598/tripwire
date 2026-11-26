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
import { INTERSTITIAL, POPUP, TRIP_LEAD } from './copy';
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
const PHONE_TRIGGERS = new Set<Trigger>(['phone_call', 'gift_card', 'crypto_wire', 'remote_download']);

export function leadFor(verdict: Verdict): string {
  const trigger = tripFor(verdict);
  // A tech-support page read passively keeps the general opening line.
  return TRIP_LEAD[trigger === 'phone_call' && verdict.trigger === 'passive' ? 'passive' : trigger];
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
  const Title = heading;
  const Question = heading === 'h1' ? 'h2' : 'h3';

  useEffect(() => {
    stopRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="tw tw-split" role="alertdialog" aria-modal="true" aria-label={INTERSTITIAL.dialogLabel}>
      <div className="tw-split__side">
        <Brand />
        <Title className="tw-h1 tw-h1--xl">{INTERSTITIAL.title}</Title>
        <RouteLine route={verdict.route} sent={verdict.bytesSentToCloud > 0} wrongSide={verdict.wrongSide} />
      </div>
      <div className="tw-split__main">
        <div className="tw-stack">
          <p className="tw-lead">{leadFor(verdict)}</p>
          <Question className="tw-h2">{INTERSTITIAL.question}</Question>
          <p className="tw-body">{INTERSTITIAL.reassurance}</p>
          {note}
          <div className="tw-col-start">
            <button ref={stopRef} type="button" className="tw-btn tw-btn--xl" onClick={byPerson(onStop)}>
              {INTERSTITIAL.primary}
            </button>
            <button type="button" className="tw-link" onClick={byPerson(onContinue)}>
              {INTERSTITIAL.secondary}
            </button>
          </div>
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
                  {flagsFor(verdict).map((flag) => (
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
