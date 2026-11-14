/**
 * Developer checks: proof, on the real machine, that Firebase AI Logic is
 * called at runtime and which side (device or cloud) answered. An extension
 * page is a document, so it can host the on-device model directly.
 */
import { useState } from 'react';
import { ALL_SAMPLES } from '../../../corpus';
import { loadConfig } from '../../config/store';
import { appCheckReady } from '../../firebase/app';
import { isFirebaseConfigured } from '../../firebase/config';
import { runEval, type EvalSummary } from '../../inference/evalCore';
import { firebaseEngine, hybridProbe, onDeviceStatus, prepareOnDeviceModel } from '../../inference/firebaseEngine';
import { assess } from '../../inference/router';
import { CHECKS } from '../../ui/copy';
import { mount } from '../../ui/ext';
import { Brand } from '../../ui/kit';

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

function Checks() {
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [probe, setProbe] = useState('');
  const [text, setText] = useState<string>(CHECKS.sampleText);
  const [verdict, setVerdict] = useState('');
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [progress, setProgress] = useState('');

  const run = (name: string, job: () => Promise<void>) => () => {
    setBusy(name);
    void job()
      .catch((err) => setStatus(`Error: ${String(err)}`))
      .finally(() => setBusy(''));
  };

  const refresh = run('status', async () => {
    const configured = isFirebaseConfigured();
    setStatus(show({ firebaseConfigured: configured, onDevice: configured ? await onDeviceStatus() : 'not configured', appCheck: configured ? appCheckReady() : false, online: navigator.onLine }));
  });
  const prepare = run('prepare', async () => {
    await prepareOnDeviceModel((f) => setStatus(`Downloading on-device model: ${Math.round(f * 100)}%`));
    setStatus(show({ onDevice: await onDeviceStatus() }));
  });
  const doProbe = run('probe', async () => {
    try {
      setProbe(show(await hybridProbe('Reply with the single word: ready')));
    } catch (err) {
      setProbe(`Error: ${String(err)}`);
    }
  });
  const check = run('check', async () => {
    setVerdict(show(await assess({ text, hostname: 'example.test', trigger: 'passive' }, { engine: firebaseEngine, config: await loadConfig() })));
  });
  const corpus = run('corpus', async () => {
    setSummary(null);
    const result = await runEval(ALL_SAMPLES, firebaseEngine, await loadConfig(), 'live-extension', (done, total, row) =>
      setProgress(`${done} / ${total} · ${row.id}: ${row.state} via ${row.route}`),
    );
    setSummary(result);
    setProgress('');
  });
  const save = () => {
    if (!summary) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }));
    a.download = 'tripwire-live-eval.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const button = (name: string, label: string, onClick: () => void, outline = true) => (
    <button type="button" className={`tw-btn${outline ? ' tw-btn--outline' : ''}`} disabled={busy !== ''} onClick={onClick}>
      {busy === name ? CHECKS.working : label}
    </button>
  );
  const wrong = summary?.rows.filter((r) => !r.correct) ?? [];

  return (
    <div className="tw tw-page">
      <header className="tw-top">
        <Brand name={`Tripwire · ${CHECKS.title}`} size={30} />
      </header>
      <main className="tw-content">
        <p className="tw-body">{CHECKS.intro}</p>

        <section className="tw-card">
          <h2 className="tw-h3">{CHECKS.status}</h2>
          <div className="tw-row">
            {button('status', CHECKS.refresh, refresh)}
            {button('prepare', CHECKS.prepare, prepare)}
          </div>
          {status && <pre className="tw-pre">{status}</pre>}
        </section>

        <section className="tw-card">
          <h2 className="tw-h3">{CHECKS.probe}</h2>
          <p className="tw-muted">{CHECKS.probeNote}</p>
          <div className="tw-row">{button('probe', CHECKS.probe, doProbe)}</div>
          {probe && <pre className="tw-pre">{probe}</pre>}
        </section>

        <section className="tw-card">
          <h2 className="tw-h3">
            <label htmlFor="sample">{CHECKS.sample}</label>
          </h2>
          <p className="tw-muted">{CHECKS.sampleNote}</p>
          <textarea id="sample" className="tw-textarea" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="tw-row">{button('check', CHECKS.run, check, false)}</div>
          {verdict && <pre className="tw-pre">{verdict}</pre>}
        </section>

        <section className="tw-card">
          <h2 className="tw-h3">{CHECKS.corpus}</h2>
          <p className="tw-muted">{CHECKS.corpusNote}</p>
          <div className="tw-row">
            {button('corpus', CHECKS.runCorpus, corpus, false)}
            {summary && button('save', CHECKS.save, save)}
          </div>
          {progress && (
            <p className="tw-muted" aria-live="polite">
              {progress}
            </p>
          )}
          {summary && (
            <>
              <table className="tw-table">
                <tbody>
                  <tr>
                    <th scope="row">Scams flagged</th>
                    <td>
                      {summary.detected} of {summary.scams} ({pct(summary.detectionRate)}), {summary.tripped} paused
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">False alarms</th>
                    <td>
                      {summary.falsePositives} of {summary.benign} ({pct(summary.falsePositiveRate)})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Routes</th>
                    <td>{Object.entries(summary.routes).map(([route, n]) => `${route}: ${n}`).join(', ')}</td>
                  </tr>
                  <tr>
                    <th scope="row">Bytes sent to cloud</th>
                    <td>{summary.totalBytesSentToCloud.toLocaleString()} (all redacted)</td>
                  </tr>
                </tbody>
              </table>
              {wrong.length > 0 && <pre className="tw-pre">{show(wrong.map(({ id, label, state, riskScore, route }) => ({ id, label, state, riskScore, route })))}</pre>}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

mount(<Checks />);
