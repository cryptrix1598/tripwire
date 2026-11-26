/**
 * Paused download: the same pause as in the page, shown in its own tab because
 * a download has no page to draw over. The download stays paused until the
 * person chooses.
 */
import { useEffect, useState } from 'react';
import { send, type PendingDownloadReply } from '../../messaging';
import { DOWNLOAD_PAUSE, SAFE_PAGE } from '../../ui/copy';
import { closeThisTab, mount } from '../../ui/ext';
import { Brand, Split } from '../../ui/kit';
import { Pause } from '../../ui/Pause';

const downloadId = Number(location.hash.slice(1));

function PausedDownload() {
  const [pending, setPending] = useState<PendingDownloadReply | null | undefined>(undefined);

  useEffect(() => {
    if (!Number.isFinite(downloadId)) return setPending(null);
    void send<PendingDownloadReply>({ target: 'background', type: 'get-pending-download', downloadId }).then(setPending);
  }, []);

  if (pending === undefined) return null;
  const verdict = pending?.verdict;
  if (!verdict) {
    return (
      <Split
        side={
          <>
            <Brand />
            <h1 className="tw-h1">{DOWNLOAD_PAUSE.expiredTitle}</h1>
            <span />
          </>
        }
      >
        <p className="tw-body">{DOWNLOAD_PAUSE.expiredBody}</p>
        <button type="button" className="tw-btn tw-btn--outline" style={{ alignSelf: 'flex-start' }} onClick={() => void closeThisTab()}>
          {SAFE_PAGE.close}
        </button>
      </Split>
    );
  }

  const decide = (outcome: 'stopped' | 'continued') =>
    send({
      target: 'background', type: 'outcome', scamType: verdict.scamType, trigger: verdict.trigger, outcome,
      hostname: pending?.hostname ?? '', page: pending?.page, downloadId,
    });

  return (
    <div className="tw-page">
      <Pause
        verdict={verdict}
        note={pending.filename ? <p className="tw-muted">{DOWNLOAD_PAUSE.file(pending.filename)}</p> : undefined}
        onStop={() => void decide('stopped').then(() => location.replace(chrome.runtime.getURL('/safe.html')))}
        onContinue={() => void decide('continued').then(() => (pending?.page ? history.back() : closeThisTab()))}
        onPhone={() => void chrome.tabs.create({ url: chrome.runtime.getURL('/call.html') })}
      />
    </div>
  );
}

mount(<PausedDownload />);
