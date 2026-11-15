/**
 * Onboarding: three screens, one idea each.
 *  1. What it does: the moments it steps in.
 *  2. The privacy promise: shown as a before-and-after, not just claimed.
 *  3. Family pairing: optional, one big code.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { dashboardUrl, demoUrl } from '../../firebase/config';
import { prepareOnDeviceModel } from '../../inference/firebaseEngine';
import { send, type PairingReply, type StatusReply } from '../../messaging';
import { ONBOARDING, REDACTION_SAMPLE } from '../../ui/copy';
import { closeThisTab, mount, openTab, useStatus } from '../../ui/ext';
import { Brand, Split } from '../../ui/kit';

const TOTAL = 3;

function Side({ step, title, extra }: { step: number; title: string; extra?: string }) {
  return (
    <>
      <Brand />
      <h1 className="tw-h1">{title}</h1>
      <div className="tw-stack tw-stack--tight">
        <div className="tw-progress" aria-hidden="true">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} data-on={i < step} />
          ))}
        </div>
        <p className="tw-muted">
          {ONBOARDING.stepLabel(step, TOTAL)}
          {extra ? ` · ${extra}` : ''}
        </p>
      </div>
    </>
  );
}

function Sample({ parts }: { parts: ReadonlyArray<string | { pii: string } | { tag: string }> }) {
  return (
    <p>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : 'pii' in part ? (
          <span key={i} className="tw-pii">
            {part.pii}
          </span>
        ) : (
          <span key={i} className="tw-tag">
            {part.tag}
          </span>
        ),
      )}
    </p>
  );
}

function ModelStatus({ status, refresh }: { status: StatusReply | null; refresh: () => void }) {
  const [pct, setPct] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const copy = ONBOARDING.privacy;

  let tone = 'rules';
  let text = '';
  let canDownload = false;
  if (status && !status.firebaseConfigured) text = copy.modelNotSetUp;
  else if (status?.onDevice === 'available') [tone, text] = ['local', copy.modelReady];
  else if (pct !== null || status?.onDevice === 'downloading') [tone, text] = ['redacted', copy.modelDownloading(pct ?? 0)];
  else if (status?.onDevice === 'downloadable') [tone, text, canDownload] = ['redacted', copy.modelDownloadable, true];
  else if (status) [tone, text] = ['fallback', copy.modelUnavailable];

  const download = () => {
    setFailed(false);
    setPct(0);
    prepareOnDeviceModel((fraction) => setPct(Math.round(fraction * 100)))
      .catch(() => setFailed(true))
      .finally(() => {
        setPct(null);
        refresh();
      });
  };

  return (
    <div className="tw-rule">
      <div className="tw-row">
        <div style={{ flex: '999 1 320px', minWidth: 0 }} className="tw-stack tw-stack--tight">
          <h2 className="tw-h3">{copy.modelTitle}</h2>
          <p className="tw-route tw-muted" aria-live="polite">
            <span className={`tw-dot tw-dot--${tone}`} aria-hidden="true" />
            <span>{failed ? copy.modelError : text}</span>
          </p>
        </div>
        {canDownload && (
          <button type="button" className="tw-btn tw-btn--outline" onClick={download}>
            {copy.modelButton}
          </button>
        )}
      </div>
    </div>
  );
}

function Pairing({ paired, onConnected }: { paired: number; onConnected: () => void }) {
  const [reply, setReply] = useState<PairingReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [baseline, setBaseline] = useState(paired);
  const copy = ONBOARDING.family;

  const getCode = () => {
    setBusy(true);
    setBaseline(paired);
    void send<PairingReply>({ target: 'background', type: 'pairing-code' }).then((r) => {
      setReply(r ?? { ok: false, reason: 'offline' });
      setBusy(false);
    });
  };

  // While a code is on screen, watch for someone using it. A code works once:
  // the moment a family member connects, it is deleted.
  const code = reply?.ok ? reply.code : null;
  useEffect(() => {
    if (!code || connected) return;
    const timer = setInterval(() => {
      void send<StatusReply>({ target: 'background', type: 'get-status' }).then((status) => {
        if (status && status.guardianCount > baseline) {
          void send({ target: 'background', type: 'pairing-finish' });
          setConnected(true);
          onConnected();
        }
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [code, connected, baseline, onConnected]);

  if (connected) {
    return (
      <div className="tw-card" role="status">
        <h2 className="tw-h3 tw-ok">{copy.connectedTitle}</h2>
        <p>{copy.connectedBody}</p>
      </div>
    );
  }

  if (reply?.ok) {
    const spaced = `${reply.code.slice(0, 3)} ${reply.code.slice(3)}`;
    return (
      <div className="tw-card">
        <h2 className="tw-label">{copy.codeLabel}</h2>
        <p className="tw-code" aria-label={reply.code.split('').join(' ')}>
          {spaced}
        </p>
        <p>{dashboardUrl ? copy.codeHelp(dashboardUrl.replace(/^https?:\/\//, '')) : copy.codeHelpNoUrl}</p>
        <p className="tw-muted" role="status">
          {copy.waiting}
        </p>
        <button type="button" className="tw-link" style={{ alignSelf: 'flex-start' }} onClick={getCode} disabled={busy}>
          {copy.newCode}
        </button>
      </div>
    );
  }
  return (
    <>
      {paired > 0 && <p className="tw-ok">{copy.paired}</p>}
      {reply && !reply.ok && (
        <p className="tw-muted" role="status">
          {copy.unavailable}
        </p>
      )}
      <button type="button" className="tw-btn tw-btn--outline" style={{ alignSelf: 'flex-start' }} onClick={getCode} disabled={busy}>
        {busy ? copy.working : copy.getCode}
      </button>
    </>
  );
}

function Onboarding() {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [status, refresh] = useStatus();

  const nav = (next: ReactNode, back?: () => void, skip?: () => void) => (
    <div className="tw-row">
      {next}
      {skip && (
        <button type="button" className="tw-link" onClick={skip}>
          {ONBOARDING.skip}
        </button>
      )}
      {back && (
        <button type="button" className="tw-link" onClick={back}>
          {ONBOARDING.back}
        </button>
      )}
    </div>
  );
  const nextButton = (to: number) => (
    <button type="button" className="tw-btn" onClick={() => setStep(to)}>
      {ONBOARDING.next}
    </button>
  );

  if (done) {
    return (
      <Split side={<Side step={3} title={ONBOARDING.done.title} />}>
        <p className="tw-body">{ONBOARDING.done.body}</p>
        <div className="tw-row">
          <button type="button" className="tw-btn" onClick={() => openTab(demoUrl)}>
            {ONBOARDING.done.demo}
          </button>
          <button type="button" className="tw-link" onClick={() => void closeThisTab()}>
            {ONBOARDING.done.close}
          </button>
        </div>
      </Split>
    );
  }

  if (step === 1) {
    return (
      <Split side={<Side step={1} title={ONBOARDING.what.title} />}>
        <p className="tw-body">{ONBOARDING.what.body}</p>
        <div className="tw-stack tw-stack--tight">
          <h2 className="tw-h3">{ONBOARDING.what.momentsLabel}</h2>
          <ul className="tw-flags" style={{ marginTop: 8 }}>
            {ONBOARDING.what.moments.map((m) => (
              <li key={m}>
                <span style={{ fontSize: 20 }}>{m}</span>
              </li>
            ))}
          </ul>
        </div>
        {nav(nextButton(2))}
      </Split>
    );
  }

  if (step === 2) {
    return (
      <Split side={<Side step={2} title={ONBOARDING.privacy.title} />}>
        <p className="tw-body">{ONBOARDING.privacy.body}</p>
        <div className="tw-card">
          <div className="tw-card__part">
            <h2 className="tw-label">{ONBOARDING.privacy.readTitle}</h2>
            <Sample parts={REDACTION_SAMPLE.before} />
          </div>
          <div className="tw-card__part">
            <h2 className="tw-label">{ONBOARDING.privacy.sentTitle}</h2>
            <Sample parts={REDACTION_SAMPLE.after} />
          </div>
          <p className="tw-small">{ONBOARDING.privacy.sampleNote}</p>
        </div>
        <ModelStatus status={status} refresh={refresh} />
        {nav(nextButton(3), () => setStep(1))}
      </Split>
    );
  }

  return (
    <Split side={<Side step={3} title={ONBOARDING.family.title} extra={ONBOARDING.family.optional} />}>
      <p className="tw-body">{ONBOARDING.family.body}</p>
      <Pairing paired={status?.guardianCount ?? 0} onConnected={refresh} />
      {nav(
        <button type="button" className="tw-btn" onClick={() => setDone(true)}>
          {ONBOARDING.finish}
        </button>,
        () => setStep(2),
        () => setDone(true),
      )}
    </Split>
  );
}

mount(<Onboarding />);
