/**
 * Toolbar popup. Three plain facts (this page, private checking, family
 * alerts), then two actions. No settings, no scores.
 */
import { useEffect, useState } from 'react';
import { demoUrl } from '../../firebase/config';
import type { Verdict } from '../../inference/schemas';
import { send, type TabStateReply } from '../../messaging';
import { POPUP } from '../../ui/copy';
import { mount, openTab, useStatus } from '../../ui/ext';
import { Brand, RouteLine } from '../../ui/kit';

function Popup() {
  const [status] = useStatus();
  const [page, setPage] = useState<{ verdict: Verdict | null; checkable: boolean; trusted?: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const state = tab?.id !== undefined ? await send<TabStateReply>({ target: 'background', type: 'get-tab-state', tabId: tab.id }) : null;
        setPage({ verdict: state?.verdict ?? null, checkable: /^https?:/.test(tab?.url ?? ''), trusted: state?.trusted ?? false });
      } catch {
        setPage({ verdict: null, checkable: false });
      }
    })();
  }, []);

  const verdict = page?.verdict ?? null;
  const pageText = !page
    ? ''
    : page.trusted
      ? POPUP.pageTrusted
      : verdict
      ? { safe: POPUP.pageSafe, caution: POPUP.pageCaution, tripped: POPUP.pageTripped }[verdict.state]
      : page.checkable
        ? POPUP.pageNotYet
        : POPUP.pageUnknown;

  const privateText = !status
    ? ''
    : !status.firebaseConfigured
      ? POPUP.privateNotSetUp
      : status.onDevice === 'available'
        ? POPUP.privateReady
        : status.onDevice === 'unavailable'
          ? POPUP.privateOff
          : POPUP.privatePending;
  const privateOk = status?.firebaseConfigured && status.onDevice === 'available';
  const familyOn = (status?.guardianCount ?? 0) > 0;

  return (
    <div className="tw tw-popup">
      <header className="tw-popup__head">
        <Brand size={28} />
        <h1 className="tw-popup__title">{POPUP.on}</h1>
      </header>
      <dl className="tw-facts">
        <div className="tw-facts__page">
          <dt>{POPUP.thisPage}</dt>
          <dd>
            <span>{pageText}</span>
            {page &&
              (page.trusted ? (
                <p className="tw-route">
                  <span className="tw-dot" aria-hidden="true" />
                  <span>{POPUP.trustedDetail}</span>
                </p>
              ) : (
                <RouteLine route={verdict?.route ?? 'not_checked'} sent={(verdict?.bytesSentToCloud ?? 0) > 0} />
              ))}
          </dd>
        </div>
        <div>
          <dt>{POPUP.privateChecks}</dt>
          <dd className={privateOk ? 'tw-ok' : undefined}>{privateText}</dd>
        </div>
        <div>
          <dt>{POPUP.family}</dt>
          <dd className={familyOn ? 'tw-ok' : undefined}>{status ? (familyOn ? POPUP.familyOn : POPUP.familyOff) : ''}</dd>
        </div>
      </dl>
      <div className="tw-popup__actions">
        <button type="button" className="tw-btn" onClick={() => openTab(chrome.runtime.getURL('/call.html'))}>
          {POPUP.callCheck}
        </button>
        <button type="button" className="tw-btn tw-btn--outline" onClick={() => openTab(demoUrl)}>
          {POPUP.practice}
        </button>
        <button type="button" className="tw-btn tw-btn--outline" onClick={() => openTab(chrome.runtime.getURL('/settings.html'))}>
          {POPUP.settings}
        </button>
        <div className="tw-row" style={{ justifyContent: 'center', gap: '0 24px' }}>
          <button type="button" className="tw-link" onClick={() => openTab(chrome.runtime.getURL('/onboarding.html'))}>
            {POPUP.setup}
          </button>
          <button type="button" className="tw-link" onClick={() => openTab(chrome.runtime.getURL('/checks.html'))}>
            {POPUP.diagnostics}
          </button>
        </div>
      </div>
    </div>
  );
}

mount(<Popup />);
