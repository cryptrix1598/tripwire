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
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PAIRING_CODE_PATTERN } from '../../src/guardian/model';
import type { ScamType, Trigger } from '../../src/inference/schemas';
import { ALERT_SUMMARY_SHOWN, DASHBOARD, SCAM_TYPE_LABEL, TRIGGER_LABEL } from '../../src/ui/copy';
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
            placeholder="000000"
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
  const continued = alert.outcome === 'continued';
  const feed = DASHBOARD.feed;
  return (
    <li className="tw-alert" data-outcome={continued ? 'continued' : 'stopped'}>
      <p className="tw-alert__when">
        <strong>{day}</strong>
        {time}
      </p>
      <div className="tw-alert__what">
        <h2 className="tw-h3">{SCAM_TYPE_LABEL[alert.scamType as ScamType] ?? SCAM_TYPE_LABEL.other}</h2>
        <p>{ALERT_SUMMARY_SHOWN[alert.scamType as ScamType] ?? alert.summary}</p>
        <p className="tw-small">{TRIGGER_LABEL[alert.action as Trigger] ?? TRIGGER_LABEL.passive}</p>
      </div>
      <div className="tw-alert__outcome">
        <p className={`tw-outcome${continued ? ' tw-outcome--continued' : ''}`}>
          {continued ? (
            <NoticeIcon color="#6b4100" />
          ) : (
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#17553b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="7,12.5 10.5,16 17,8.5" />
            </svg>
          )}
          <span>{continued ? feed.continued : feed.stopped}</span>
        </p>
        <p className="tw-small" style={continued ? { color: '#4A3A12' } : undefined}>
          {continued ? feed.continuedAdvice : feed.stoppedAdvice}
        </p>
      </div>
    </li>
  );
}

function Feed({ person }: { person: Person }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
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
        setAlerts(snap.docs.map((d) => ({ id: d.id, ...(d.data({ serverTimestamps: 'estimate' }) as Omit<Alert, 'id'>) })));
      },
      (err) => {
        // Until they tap "Yes, allow", the rules refuse: wait and try again.
        if ((err as { code?: string }).code === 'permission-denied') {
          setWaiting(true);
          retry = setTimeout(() => setAttempt((n) => n + 1), 3000);
        } else setFailed(true);
      },
    );
    return () => {
      clearTimeout(retry);
      stop();
    };
  }, [person.deviceId, attempt]);

  return (
    <>
      <div className="tw-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="tw-stack tw-stack--tight" style={{ gap: 8 }}>
          <h1 className="tw-h1">{person.nickname}</h1>
          <p className="tw-muted">{feed.subtitle}</p>
        </div>
        {!failed && alerts && (
          <p className="tw-live">
            <span className="tw-dot tw-dot--local" aria-hidden="true" />
            <span>{feed.live}</span>
          </p>
        )}
      </div>
      {waiting ? (
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
          <button type="button" className="tw-link tw-link--on-deep" style={{ color: '#F4F8FA' }} onClick={() => setPairing(true)}>
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
