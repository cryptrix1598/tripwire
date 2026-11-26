/**
 * The "caution" state: a calm banner over the page. It states one thing in
 * plain words, never blocks the page, and keeps the detail behind "Why?".
 * Amber is the only signal colour; the page underneath stays usable.
 */
import { useState } from 'react';
import type { Verdict } from '../inference/schemas';
import { BANNER, CAUTION_HEADLINE, WHY } from './copy';
import { Mark, RouteLine, SentReceipt, byPerson, flagsFor, routeExplanation } from './kit';

export function Banner({ verdict, onDismiss }: { verdict: Verdict; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const headline = verdict.failSafe ? BANNER.failSafeHeadline : CAUTION_HEADLINE[verdict.scamType];
  const sub = verdict.failSafe ? BANNER.failSafeSub : BANNER.sub;

  return (
    <section className="tw tw-banner" role="region" aria-label={BANNER.regionLabel} aria-live="polite">
      <div className="tw-banner__row">
        <div className="tw-banner__text">
          <Mark size={40} color="#14344D" label="Tripwire" />
          <div>
            <h2 className="tw-banner__title">{headline}</h2>
            <p className="tw-banner__sub">{sub}</p>
          </div>
        </div>
        <div className="tw-banner__actions">
          <button type="button" className="tw-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? BANNER.hide : BANNER.why}
          </button>
          <button type="button" className="tw-link" aria-label={BANNER.dismissLabel} onClick={byPerson(onDismiss)}>
            {BANNER.dismiss}
          </button>
        </div>
      </div>
      {open && (
        <div className="tw-banner__why">
          <div className="tw-why__part" lang={verdict.explanationLanguage}>
            <h3 className="tw-why__title">
              {WHY.flagsLabel}
            </h3>
            {verdict.explanation && <p>{verdict.explanation}</p>}
            <ul className="tw-flags">
              {flagsFor(verdict).map((flag) => (
                <li key={flag}>
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="tw-why__part">
            <h3 className="tw-why__title">{WHY.routeLabel}</h3>
            <RouteLine route={verdict.route} sent={verdict.bytesSentToCloud > 0} wrongSide={verdict.wrongSide} downloading={verdict.modelDownloading} />
            <p className="tw-muted">{routeExplanation(verdict)}</p>
            <SentReceipt verdict={verdict} />
          </div>
        </div>
      )}
    </section>
  );
}
