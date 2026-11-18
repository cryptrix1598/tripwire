/**
 * "Someone is on the phone with me": the check for a phone call.
 *
 * Most scams that reach older people start with a call, which no browser can see. Here the
 * person types, in their own words, what the caller is saying or asking. The same router
 * checks it: Gemini Nano on this computer first, and only when it is unsure (or this
 * computer has no on-device model) a redacted copy goes to the cloud. The person asked
 * for this check, so it always reaches a model.
 */
import { useState, type FormEvent } from 'react';
import { send, type AssessReply } from '../../messaging';
import type { Verdict } from '../../inference/schemas';
import { CALL } from '../../ui/copy';
import { closeThisTab, mount } from '../../ui/ext';
import { Brand, RouteLine, SentReceipt, Split, flagsFor, routeExplanation } from '../../ui/kit';

function CallCheck() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  const check = async (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 8 || busy) return;
    setBusy(true);
    setFailed(false);
    setVerdict(null);
    try {
      const reply = await send<AssessReply>({
        target: 'background',
        type: 'assess',
        input: { text: text.trim().slice(0, 4000), hostname: 'phone call', trigger: 'phone_call', source: 'call', language: navigator.language },
      });
      if (reply?.verdict) setVerdict(reply.verdict);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const hungUp = () => {
    if (verdict && verdict.state !== 'safe') {
      void send({ target: 'background', type: 'outcome', scamType: verdict.scamType, trigger: 'phone_call', outcome: 'stopped', hostname: 'phone call' });
    }
    setDone(true);
  };

  const again = () => {
    setText('');
    setVerdict(null);
    setDone(false);
  };

  const result = verdict && CALL.result[verdict.state];

  return (
    <Split
      side={
        <>
          <Brand />
          <h1 className="tw-h1 tw-h1--xl">{CALL.side}</h1>
          <p style={{ fontSize: 20 }}>{CALL.sideBody}</p>
        </>
      }
    >
      {done ? (
        <section className="tw-stack" aria-live="polite">
          <h2 className="tw-h1">{CALL.doneTitle}</h2>
          <p style={{ fontSize: 20 }}>{CALL.doneBody}</p>
          <div className="tw-row">
            <button type="button" className="tw-btn tw-btn--xl" onClick={() => void closeThisTab()}>
              {CALL.close}
            </button>
            <button type="button" className="tw-btn tw-btn--outline" onClick={again}>
              {CALL.again}
            </button>
          </div>
        </section>
      ) : verdict && result ? (
        <section className="tw-stack" aria-live="polite">
          <h2 className="tw-h1">{result.title}</h2>
          <p style={{ fontSize: 20 }}>{result.body}</p>
          {verdict.state !== 'safe' && (
            <ul className="tw-flags">
              {flagsFor(verdict).map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}
          {verdict.explanation && verdict.state !== 'safe' && <p>{verdict.explanation}</p>}
          <p className="tw-muted">{CALL.callBack}</p>
          <div className="tw-row">
            {verdict.state !== 'safe' ? (
              <button type="button" className="tw-btn tw-btn--xl" onClick={hungUp}>
                {CALL.hungUp}
              </button>
            ) : (
              <button type="button" className="tw-btn tw-btn--xl" onClick={() => void closeThisTab()}>
                {CALL.close}
              </button>
            )}
            <button type="button" className="tw-btn tw-btn--outline" onClick={again}>
              {CALL.again}
            </button>
          </div>
          <RouteLine route={verdict.route} />
          <p className="tw-small">{routeExplanation(verdict)}</p>
          <SentReceipt verdict={verdict} />
        </section>
      ) : (
        <form className="tw-stack" onSubmit={(e) => void check(e)}>
          <h2 className="tw-h1">{CALL.title}</h2>
          <p style={{ fontSize: 20 }}>{CALL.body}</p>
          <div className="tw-stack tw-stack--tight">
            <label className="tw-label" htmlFor="call-text">
              {CALL.label}
            </label>
            <textarea
              id="call-text"
              className="tw-textarea"
              rows={6}
              value={text}
              placeholder={CALL.placeholder}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <p className="tw-small">{CALL.privacy}</p>
          {failed && <p role="alert">{CALL.failed}</p>}
          <div className="tw-row">
            <button type="submit" className="tw-btn tw-btn--xl" disabled={busy || text.trim().length < 8}>
              {busy ? CALL.checking : CALL.check}
            </button>
          </div>
          <p className="tw-muted">{CALL.hangUpAnytime}</p>
        </form>
      )}
    </Split>
  );
}

mount(<CallCheck />);
