/**
 * "You stopped": where "Stop and stay safe" lands. Praise first, then three
 * concrete next steps. Nothing here asks the person to decide anything.
 */
import type { ReactNode } from 'react';
import { SAFE_PAGE } from '../../ui/copy';
import { closeThisTab, mount, useStatus } from '../../ui/ext';
import { Brand, Split } from '../../ui/kit';

const icon = (children: ReactNode) => (
  <svg aria-hidden="true" width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#14344D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ICONS = [
  icon(
    <>
      <path d="M10 26c8-7 16-7 24 0l-3 5-5-2v-4c-3-1-5-1-8 0v4l-5 2z" />
      <line x1="8" y1="10" x2="36" y2="38" />
    </>,
  ),
  icon(
    <>
      <rect x="5" y="11" width="34" height="22" rx="4" />
      <line x1="5" y1="18" x2="39" y2="18" />
      <line x1="11" y1="26" x2="21" y2="26" />
    </>,
  ),
  icon(
    <>
      <circle cx="16" cy="16" r="6" />
      <circle cx="30" cy="18" r="5" />
      <path d="M5 35c1-7 6-10 11-10s10 3 11 10" />
      <path d="M29 27c5 0 9 3 10 8" />
    </>,
  ),
];

function Safe() {
  const [status] = useStatus();
  return (
    <Split
      side={
        <>
          <Brand />
          <div className="tw-stack tw-stack--tight" style={{ gap: 20 }}>
            <svg aria-hidden="true" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="#7FD1AE" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="36" cy="36" r="31" />
              <polyline points="22,37 32,47 51,27" />
            </svg>
            <h1 className="tw-h1 tw-h1--xl">{SAFE_PAGE.title}</h1>
          </div>
          <p className="tw-muted" style={{ fontSize: 20 }}>
            {SAFE_PAGE.body}
          </p>
        </>
      }
    >
      <h2 className="tw-h2" style={{ fontSize: 30 }}>
        {SAFE_PAGE.nextTitle}
      </h2>
      <ol className="tw-steps">
        {SAFE_PAGE.steps.map((step, i) => (
          <li key={step.title}>
            {ICONS[i]}
            <div className="tw-stack tw-stack--tight" style={{ gap: 6 }}>
              <h3 className="tw-h3">{step.title}</h3>
              <p className="tw-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="tw-rule" style={{ alignItems: 'flex-start' }}>
        {(status?.guardianCount ?? 0) > 0 && <p className="tw-muted">{SAFE_PAGE.guardianNote}</p>}
        <button type="button" className="tw-btn tw-btn--outline" onClick={() => void closeThisTab()}>
          {SAFE_PAGE.close}
        </button>
      </div>
    </Split>
  );
}

mount(<Safe />);
