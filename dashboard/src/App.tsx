/**
 * Family dashboard.
 *
 * Design: the guardian's question is "is the person I care about OK?", so the
 * feed answers it in rows they can scan: when, what kind, what happened. The
 * one alert that needs a phone call ("continued anyway") differs by color,
 * icon and wording, never color alone. What the guardian can NOT see is
 * stated on the page, because that promise is the product.
 */
import { GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PAIRING_CODE_PATTERN } from '../../src/guardian/model';
import type { ProtectionAction, ScamType, Trigger } from '../../src/inference/schemas';
import { ACTION_ALERT_SUMMARY, ACTION_TITLE, ALERT_SUMMARY_SHOWN, DASHBOARD, PROTECTION_LABEL, SCAM_TYPE_LABEL, TRIGGER_LABEL } from '../../src/ui/copy';
import { Brand, NoticeIcon, Split, Tick } from '../../src/ui/kit';
import { auth, configured, db } from './firebase';

interface Person {
  deviceId: string;
  nickname: string;
}
export interface Alert {
  id: string;
  createdAt: Timestamp | null;
  scamType: string;
  summary: string;
  action: string;
  outcome: string;
}

function Shell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw tw-page">
      <header className="tw-top">
        <Brand name={DASHBOARD.title} size={30} />
        {actions && <div className="tw-row">{actions}</div>}
      </header>
      <main className="tw-content">{children}</main>
    </div>
  );
}

function Seen() {
  const list = (items: readonly string[], ok: boolean) => (
    <ul className="tw-ticks">
      {items.map((item) => (
        <li key={item}>
          <Tick ok={ok} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <aside>
      <h2 className="tw-h3" style={{ fontSize: 24 }}>
        {DASHBOARD.feed.privacyTitle}
      </h2>
      <div className="tw-stack tw-stack--tight">
        <h3 className="tw-label tw-ok">{DASHBOARD.see.yes}</h3>
        {list(DASHBOARD.see.yesItems, true)}
      </div>
      <div className="tw-stack tw-stack--tight">
        <h3 className="tw-label">{DASHBOARD.see.no}</h3>
        {list(DASHBOARD.see.noItems, false)}
      </div>
    </aside>
  );
}

function SignIn() {
  const [failed, setFailed] = useState(false);
  const attempt = (job: () => Promise<unknown>) => () => {
    setFailed(false);
    job().catch(() => setFailed(true));
  };
  return (
    <Split
      side={
        <>
          <Brand name={DASHBOARD.title} />
          <h1 className="tw-h1">{DASHBOARD.signIn.title}</h1>
          <span />
        </>
      }
    >
      <p className="tw-body">{DASHBOARD.signIn.body}</p>
      <div className="tw-col-start">
        <button type="button" className="tw-btn" onClick={attempt(() => signInWithPopup(auth!, new GoogleAuthProvider()))}>
          {DASHBOARD.signIn.google}
        </button>
        <button type="button" className="tw-link" onClick={attempt(() => signInAnonymously(auth!))}>
          {DASHBOARD.signIn.guest}
        </button>
      </div>
      <p className="tw-small">{DASHBOARD.signIn.guestNote}</p>
      {failed && (
        <p className="tw-notice" role="alert">
          <NoticeIcon />
          <span>{DASHBOARD.signIn.error}</span>
        </p>
      )}
    </Split>
  );
}

export function Pair({ uid, onDone }: { uid: string; onDone: (deviceId: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [me, setMe] = useState(auth?.currentUser?.displayName?.split(' ')[0] ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = DASHBOARD.pair;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (!PAIRING_CODE_PATTERN.test(clean)) return setError(copy.errorFormat);
    setBusy(true);
    setError('');
    try {
      const found = await getDoc(doc(db!, 'pairingCodes', clean));
      const data = found.data() as { deviceId?: string; expiresAt?: Timestamp; usedBy?: string } | undefined;
      if (!data?.deviceId || !data.expiresAt || data.expiresAt.toMillis() < Date.now() || data.usedBy) {
        setError(copy.errorNotFound);
        return;
      }
      // The security rules re-check the code on the server; this client check is only for a clear message.
      // Claim the code and create the link together: the rules allow each code to be claimed once.
      const batch = writeBatch(db!);
      batch.update(doc(db!, 'pairingCodes', clean), { usedBy: uid });
      // Their name goes on the link, so the person sees who is asking before tapping "Yes, allow".
      const myName = me.trim().slice(0, 40).replace(/^[^\p{L}]+/u, '');
      batch.set(doc(db!, 'devices', data.deviceId, 'guardians', uid), { code: clean, pairedAt: serverTimestamp(), ...(myName ? { name: myName } : {}) });
      await batch.commit();
      await setDoc(doc(db!, 'guardians', uid, 'people', data.deviceId), {
        nickname: name.trim().slice(0, 40) || DASHBOARD.feed.someone,
        addedAt: serverTimestamp(),
      });
      onDone(data.deviceId);
    } catch (err) {
      // App Check refused this browser (for example an automated one): say so, instead of blaming the internet.
      const refused = (err as { code?: string } | null)?.code === 'permission-denied';
      setError(refused ? copy.errorBlocked : copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tw-pair">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="tw-stack tw-stack--tight">
          <h1 className="tw-h1">{copy.title}</h1>
          <p className="tw-muted" style={{ maxWidth: '32em' }}>
            {copy.body}
          </p>
        </div>
        <div className="tw-field">
          <label htmlFor="pair-code">{copy.codeLabel}</label>
          <input
            id="pair-code"
            className="tw-input tw-input--code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pair-error' : undefined}
          />
        </div>
        <div className="tw-field">
          <label htmlFor="pair-name">{copy.nameLabel}</label>
          <input id="pair-name" className="tw-input" type="text" autoComplete="off" maxLength={40} placeholder={copy.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="tw-field">
          <label htmlFor="pair-me">{copy.meLabel}</label>
          <input id="pair-me" className="tw-input" type="text" autoComplete="given-name" maxLength={40} placeholder={copy.mePlaceholder} value={me} onChange={(e) => setMe(e.target.value.replace(/[^\p{L} .'-]/gu, ''))} aria-describedby="pair-me-help" />
          <p id="pair-me-help" className="tw-small">{copy.meHelp}</p>
        </div>
        {error && (
          <p id="pair-error" className="tw-notice" role="alert">
            <NoticeIcon />
            <span>{error}</span>
          </p>
        )}
        <button type="submit" className="tw-btn" style={{ alignSelf: 'flex-start', minHeight: 64, padding: '0 40px', fontSize: 22 }} disabled={busy}>
          {busy ? copy.working : copy.submit}
        </button>
      </form>
      <Seen />
    </div>
  );
}

function when(ts: Timestamp | null): { day: string; time: string } {
  const date = ts?.toDate() ?? new Date();
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((midnight(new Date()) - midnight(date)) / 86_400_000);
  const day = daysAgo === 0 ? DASHBOARD.feed.today : daysAgo === 1 ? DASHBOARD.feed.yesterday : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { day, time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
}

export function AlertRow({ alert }: { alert: Alert }) {
  const { day, time } = when(alert.createdAt);
  const changed = alert.outcome === 'changed';
  const continued = alert.outcome === 'continued' || changed;
  const feed = DASHBOARD.feed;
  const special = alert.action in ACTION_TITLE ? (alert.action as keyof typeof ACTION_TITLE) : null;
  return (
    <li className="tw-alert" data-outcome={continued ? 'continued' : 'stopped'}>
      <p className="tw-alert__when">
        <strong>{day}</strong>
        {time}
      </p>
      <div className="tw-alert__what">
        <h2 className="tw-h3">{special ? ACTION_TITLE[special] : (SCAM_TYPE_LABEL[alert.scamType as ScamType] ?? SCAM_TYPE_LABEL.other)}</h2>
        <p>{special ? ACTION_ALERT_SUMMARY[special] : (ALERT_SUMMARY_SHOWN[alert.scamType as ScamType] ?? alert.summary)}</p>
        <p className="tw-small">
          {PROTECTION_LABEL[alert.action as ProtectionAction] ?? TRIGGER_LABEL[alert.action as Trigger] ?? TRIGGER_LABEL.passive}
        </p>
      </div>
      <div className="tw-alert__outcome">
        <p className={`tw-outcome${continued ? ' tw-outcome--continued' : ''}`}>
          {continued ? (
            <NoticeIcon color="#1d43a6" />
          ) : (
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1c48b0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="7,12.5 10.5,16 17,8.5" />
            </svg>
          )}
          <span>{changed ? feed.changed : continued ? feed.continued : feed.stopped}</span>
        </p>
        <p className="tw-small" style={continued ? { color: '#1C3765' } : undefined}>
          {changed ? feed.changedAdvice : continued ? feed.continuedAdvice : feed.stoppedAdvice}
        </p>
      </div>
    </li>
  );
}

/** How long the computer may go without checking in before the family is told. */
const QUIET_AFTER_MS = 3 * 86_400_000;

/** "Tripwire last checked in today", or, after a few silent days, a gentle nudge to call. */
/** Computers whose alerts this page has read at least once, so a later refusal means "disconnected", not "not allowed yet". */
const connectedOnce = new Set<string>();

function LastSeen({ deviceId }: { deviceId: string }) {
  const [seen, setSeen] = useState<Timestamp | null>(null);
  useEffect(() => {
    let live = true;
    getDoc(doc(db!, 'devices', deviceId))
      .then((snap) => live && setSeen((snap.data()?.lastSeenAt as Timestamp | undefined) ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [deviceId]);
  if (!seen) return null;
  const { day } = when(seen);
  const feed = DASHBOARD.feed;
  const plain = day === feed.today || day === feed.yesterday ? day.toLowerCase() : `on ${day}`;
  if (Date.now() - seen.toMillis() > QUIET_AFTER_MS) {
    return (
      <p className="tw-notice" role="status">
        <NoticeIcon color="#1d43a6" />
        <span>{feed.quiet(day)}</span>
      </p>
    );
  }
  return <p className="tw-small">{feed.lastSeen(plain)}</p>;
}

/**
 * A five-minute hold running on their computer right now. An approved family member may answer it
 * once: let it go through (after talking to them), or keep it on hold for half an hour so there is
 * time to call. firestore.rules allows exactly these two answers, only while the hold is running.
 */
function HoldCard({ deviceId }: { deviceId: string }) {
  type Hold = { action: Trigger; endsAt: Timestamp; decision: string; decidedAt?: Timestamp };
  const [hold, setHold] = useState<Hold | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);
  // "Let it go through" is offered only to family connected over a day ago (the security rules say the same).
  const [canRelease, setCanRelease] = useState(false);
  const feed = DASHBOARD.feed;
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db!, 'devices', deviceId, 'guardians', uid))
      .then((s) => {
        const at = s.data()?.approvedAt as Timestamp | undefined;
        setCanRelease(at !== undefined && typeof at.toMillis === 'function' && Date.now() - at.toMillis() > 24 * 3_600_000);
      })
      .catch(() => setCanRelease(false));
  }, [deviceId]);
  useEffect(
    () =>
      onSnapshot(
        doc(db!, 'devices', deviceId, 'holds', 'current'),
        (snap) => setHold((snap.data({ serverTimestamps: 'estimate' }) as Hold | undefined) ?? null),
        () => setHold(null),
      ),
    [deviceId],
  );
  // Re-render now and then, so a hold that runs out disappears on its own.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!hold) return null;
  if (hold.decision === 'released' || hold.decision === 'extended') {
    const recent = hold.decidedAt && Date.now() - hold.decidedAt.toMillis() < 30 * 60_000;
    return recent ? (
      <p className="tw-notice" role="status">
        <Tick />
        <span>{hold.decision === 'released' ? feed.holdReleased : feed.holdExtended}</span>
      </p>
    ) : null;
  }
  if (hold.decision !== 'waiting' || hold.endsAt.toMillis() <= Date.now()) return null;
  const answer = async (decision: 'released' | 'extended') => {
    setBusy(true);
    setFailed(false);
    try {
      await updateDoc(doc(db!, 'devices', deviceId, 'holds', 'current'), { decision, decidedAt: serverTimestamp() });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const until = hold.endsAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <section className="tw-hold tw-hold--family" aria-labelledby="hold-title">
      <h2 id="hold-title" className="tw-hold__lead">{feed.holdTitle}</h2>
      <p>{feed.holdBody(TRIGGER_LABEL[hold.action] ?? TRIGGER_LABEL.passive, until)}</p>
      <p>{feed.holdAdvice}</p>
      <div className="tw-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="tw-btn" disabled={busy} onClick={() => void answer('extended')}>
          {feed.holdExtend}
        </button>
        {canRelease && (
          <button type="button" className="tw-btn tw-btn--outline" disabled={busy} onClick={() => void answer('released')}>
            {feed.holdRelease}
          </button>
        )}
      </div>
      {!canRelease && <p className="tw-muted">{feed.holdNewFamily}</p>}
      {failed && (
        <p className="tw-notice" role="alert">
          <NoticeIcon />
          <span>{feed.holdFailed}</span>
        </p>
      )}
    </section>
  );
}

function Feed({ person }: { person: Person }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const feed = DASHBOARD.feed;

  useEffect(() => {
    setFailed(false);
    let retry: ReturnType<typeof setTimeout> | undefined;
    const q = query(collection(db!, 'devices', person.deviceId, 'alerts'), orderBy('createdAt', 'desc'), limit(50));
    const stop = onSnapshot(
      q,
      (snap) => {
        setWaiting(false);
        setDisconnected(false);
        connectedOnce.add(person.deviceId);
        setAlerts(snap.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as Omit<Alert, 'id'>) })));
      },
      (err) => {
        // Until they tap "Yes, allow", the rules refuse: wait and try again.
        if ((err as { code?: string }).code === 'permission-denied') {
          // Read before and refused now: they disconnected this page on their computer.
          if (connectedOnce.has(person.deviceId)) setDisconnected(true);
          else setWaiting(true);
          retry = setTimeout(() => setAttempt((n) => n + 1), 3000);
        } else setFailed(true);
      },
    );
    return () => {
      clearTimeout(retry);
      stop();
    };
  }, [person.deviceId, attempt]);

  // A listener is not always cut off when access goes, so also look for this page's own link now and then.
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    const look = () =>
      void getDoc(doc(db!, 'devices', person.deviceId, 'guardians', uid))
        .then((s) => {
          if (!s.exists() && connectedOnce.has(person.deviceId)) setDisconnected(true);
        })
        .catch(() => undefined);
    const t = setInterval(look, 30_000);
    return () => clearInterval(t);
  }, [person.deviceId]);

  return (
    <>
      <div className="tw-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="tw-stack tw-stack--tight" style={{ gap: 8 }}>
          <h1 className="tw-h1">{person.nickname}</h1>
          <p className="tw-muted">{feed.subtitle}</p>
          {!waiting && <LastSeen deviceId={person.deviceId} />}
        </div>
        {!failed && alerts && (
          <p className="tw-live">
            <span className="tw-dot tw-dot--local" aria-hidden="true" />
            <span>{feed.live}</span>
          </p>
        )}
      </div>
      {!waiting && !disconnected && <HoldCard deviceId={person.deviceId} />}
      {disconnected ? (
        <p className="tw-notice" role="alert">
          <NoticeIcon />
          <span>{feed.disconnected(person.nickname)}</span>
        </p>
      ) : waiting ? (
        <p className="tw-muted" role="status">{feed.waitingApproval}</p>
      ) : failed ? (
        <p className="tw-notice" role="alert">
          <NoticeIcon />
          <span>{feed.loadError}</span>
        </p>
      ) : !alerts ? (
        <p className="tw-muted">{feed.loading}</p>
      ) : alerts.length === 0 ? (
        <div className="tw-card" style={{ padding: '56px 40px', boxShadow: 'none' }}>
          <h2 className="tw-h2" style={{ fontSize: 30 }}>
            {feed.emptyTitle}
          </h2>
          <p className="tw-muted">{feed.emptyBody}</p>
        </div>
      ) : (
        <ul className="tw-feed" aria-live="polite">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </ul>
      )}
      <p className="tw-small" style={{ maxWidth: '44em' }}>
        {feed.privacyBody}
      </p>
    </>
  );
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(configured ? undefined : null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);
  useEffect(() => {
    setPeople(null);
    if (!user || !db) return;
    return onSnapshot(
      collection(db, 'guardians', user.uid, 'people'),
      (snap) => setPeople(snap.docs.map((d) => ({ deviceId: d.id, nickname: String(d.data().nickname ?? DASHBOARD.feed.someone) }))),
      () => setPeople([]),
    );
  }, [user]);

  if (!configured) {
    return (
      <Shell>
        <h1 className="tw-h1">{DASHBOARD.notSetUp.title}</h1>
        <p className="tw-body">{DASHBOARD.notSetUp.body}</p>
      </Shell>
    );
  }
  if (user === undefined) return <Shell>{null}</Shell>;
  if (!user) return <SignIn />;

  const out = (
    <button type="button" className="tw-link tw-link--on-deep" onClick={() => void signOut(auth!)}>
      {DASHBOARD.feed.signOut}
    </button>
  );
  if (!people) return <Shell actions={out}>{null}</Shell>;

  if (pairing || people.length === 0) {
    return (
      <Shell actions={out}>
        <Pair
          uid={user.uid}
          onDone={(deviceId) => {
            setSelected(deviceId);
            setPairing(false);
          }}
        />
      </Shell>
    );
  }

  const person = people.find((p) => p.deviceId === selected) ?? people[0]!;
  return (
    <Shell
      actions={
        <>
          <button type="button" className="tw-link tw-link--on-deep" style={{ color: '#F5F8FD' }} onClick={() => setPairing(true)}>
            {DASHBOARD.feed.addAnother}
          </button>
          {out}
        </>
      }
    >
      {people.length > 1 && (
        <div className="tw-people" role="group" aria-label={DASHBOARD.title}>
          {people.map((p) => (
            <button key={p.deviceId} type="button" aria-pressed={p.deviceId === person.deviceId} onClick={() => setSelected(p.deviceId)}>
              {p.nickname}
            </button>
          ))}
        </div>
      )}
      <Feed person={person} />
    </Shell>
  );
}
