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
import { INTERSTITIAL, TRIP_LEAD } from './copy';
import { Brand, RouteLine, SentReceipt, flagsFor, routeExplanation } from './kit';

/** A passive trip still deserves the most specific opening line we can honestly give. */
export function leadFor(verdict: Verdict): string {
  let trigger: Trigger = verdict.trigger;
  if (trigger === 'passive') {
    if (verdict.scamType === 'gift_card') trigger = 'gift_card';
    else if (verdict.scamType === 'investment_crypto') trigger = 'crypto_wire';
  }
  return TRIP_LEAD[trigger];
}

export function Pause({
  verdict,
  onStop,
  onContinue,
  note,
  heading = 'h1',
}: {
  verdict: Verdict;
  onStop: () => void;
  onContinue: () => void;
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
        <RouteLine route={verdict.route} />
      </div>
      <div className="tw-split__main">
        <div className="tw-stack">
          <p className="tw-lead">{leadFor(verdict)}</p>
          <Question className="tw-h2">{INTERSTITIAL.question}</Question>
          <p className="tw-body">{INTERSTITIAL.reassurance}</p>
          {note}
          <div className="tw-col-start">
            <button ref={stopRef} type="button" className="tw-btn tw-btn--xl" onClick={onStop}>
              {INTERSTITIAL.primary}
            </button>
            <button type="button" className="tw-link" onClick={onContinue}>
              {INTERSTITIAL.secondary}
            </button>
          </div>
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
