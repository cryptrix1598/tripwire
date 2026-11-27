/**
 * The page Chrome opens after Tripwire is removed (chrome.runtime.setUninstallURL).
 * Scammers on the phone sometimes talk people into removing safety software, so
 * this is the last thing Tripwire can say: hang up, and how to put it back.
 */
import '../../src/ui/fonts.css';
import '../../src/ui/tripwire.css';
import { createRoot } from 'react-dom/client';
import { REMOVED } from '../../src/ui/copy';
import { Brand, Split } from '../../src/ui/kit';

function Removed() {
  return (
    <Split
      side={
        <>
          <Brand />
          <h1 className="tw-h1 tw-h1--xl">{REMOVED.side}</h1>
          <span aria-hidden="true" />
        </>
      }
    >
      <section className="tw-stack">
        <h2 className="tw-h1">{REMOVED.title}</h2>
        <p className="tw-lead">{REMOVED.body}</p>
        <div className="tw-hold" role="note">
          <p className="tw-hold__lead">{REMOVED.callerLead}</p>
          <p>{REMOVED.callerBody}</p>
        </div>
        <p className="tw-body">{REMOVED.putBack}</p>
      </section>
    </Split>
  );
}

createRoot(document.getElementById('root')!).render(<Removed />);
