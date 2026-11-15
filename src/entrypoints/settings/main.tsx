/**
 * Settings: three plain choices, saved the moment they change.
 *  1. How careful Tripwire is (three steps, not a score).
 *  2. Sites the person trusts, with a warning written for the exact way
 *     scammers would try to abuse this list.
 *  3. Explanations in the browser's language.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_SETTINGS, SENSITIVITY, loadSettings, normalizeSite, saveSettings, type Settings } from '../../config/settings';
import { explainLanguage } from '../../inference/prompts';
import { SETTINGS } from '../../ui/copy';
import { closeThisTab, mount } from '../../ui/ext';
import { Brand, NoticeIcon, Split } from '../../ui/kit';

function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState('');
  const [site, setSite] = useState('');
  const [error, setError] = useState('');
  const language = explainLanguage(typeof chrome !== 'undefined' && chrome.i18n ? chrome.i18n.getUILanguage() : navigator.language);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);
  if (!settings) return null;

  const update = (next: Settings, message: string = SETTINGS.saved) => {
    setSettings(next);
    void saveSettings(next).then(() => setStatus(message));
  };

  const level = SENSITIVITY.indexOf(settings.sensitivity);
  const levelCopy = SETTINGS.careful.levels[settings.sensitivity];

  const addSite = (event: FormEvent) => {
    event.preventDefault();
    const clean = normalizeSite(site);
    if (!clean) return setError(SETTINGS.trusted.invalid);
    if (settings.trustedSites.includes(clean)) return setError(SETTINGS.trusted.duplicate);
    setError('');
    setSite('');
    update({ ...settings, trustedSites: [...settings.trustedSites, clean].sort() }, SETTINGS.trusted.added(clean));
  };

  return (
    <Split
      side={
        <>
          <Brand />
          <h1 className="tw-h1 tw-h1--xl">{SETTINGS.pageTitle}</h1>
          <p className="tw-muted" style={{ fontSize: 20 }}>
            {SETTINGS.side}
          </p>
        </>
      }
    >
      <section className="tw-stack tw-stack--tight" aria-labelledby="careful-title">
        <h2 id="careful-title" className="tw-h3" style={{ fontSize: 26 }}>
          {SETTINGS.careful.title}
        </h2>
        <div className="tw-range">
          <input
            type="range"
            min={0}
            max={SENSITIVITY.length - 1}
            step={1}
            value={level}
            aria-label={SETTINGS.careful.sliderLabel}
            aria-valuetext={levelCopy.name}
            onChange={(e) => update({ ...settings, sensitivity: SENSITIVITY[Number(e.target.value)] ?? DEFAULT_SETTINGS.sensitivity })}
          />
          <div className="tw-range__labels" aria-hidden="true">
            {SENSITIVITY.map((key) => (
              <span key={key} data-on={key === settings.sensitivity}>
                {SETTINGS.careful.levels[key].name}
              </span>
            ))}
          </div>
        </div>
        <p className="tw-muted">{levelCopy.body}</p>
      </section>

      <section className="tw-rule" aria-labelledby="trusted-title">
        <h2 id="trusted-title" className="tw-h3" style={{ fontSize: 26 }}>
          {SETTINGS.trusted.title}
        </h2>
        <p>{SETTINGS.trusted.body}</p>
        <p className="tw-notice" style={{ color: '#4a3a12' }}>
          <NoticeIcon color="#6b4100" />
          <span>{SETTINGS.trusted.warning}</span>
        </p>
        <form className="tw-row" onSubmit={addSite} noValidate>
          <div className="tw-field" style={{ flex: '999 1 280px', minWidth: 0 }}>
            <label htmlFor="site">{SETTINGS.trusted.inputLabel}</label>
            <input
              id="site"
              className="tw-input"
              style={{ maxWidth: 'none' }}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={SETTINGS.trusted.placeholder}
              value={site}
              onChange={(e) => setSite(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'site-error' : undefined}
            />
          </div>
          <button type="submit" className="tw-btn tw-btn--outline" style={{ alignSelf: 'flex-end' }}>
            {SETTINGS.trusted.add}
          </button>
        </form>
        {error && (
          <p id="site-error" className="tw-notice" role="alert">
            <NoticeIcon />
            <span>{error}</span>
          </p>
        )}
        {settings.trustedSites.length === 0 ? (
          <p className="tw-muted">{SETTINGS.trusted.empty}</p>
        ) : (
          <ul className="tw-sites">
            {settings.trustedSites.map((trusted) => (
              <li key={trusted}>
                <span>{trusted}</span>
                <button
                  type="button"
                  className="tw-link"
                  aria-label={SETTINGS.trusted.removeLabel(trusted)}
                  onClick={() => update({ ...settings, trustedSites: settings.trustedSites.filter((s) => s !== trusted) }, SETTINGS.trusted.removed(trusted))}
                >
                  {SETTINGS.trusted.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tw-rule" aria-labelledby="language-title">
        <h2 id="language-title" className="tw-h3" style={{ fontSize: 26 }}>
          {SETTINGS.language.title}
        </h2>
        {language ? (
          <>
            <label className="tw-check">
              <input type="checkbox" checked={settings.explainInBrowserLanguage} onChange={(e) => update({ ...settings, explainInBrowserLanguage: e.target.checked })} />
              <span>{SETTINGS.language.toggle(language.name)}</span>
            </label>
            <p className="tw-muted">{SETTINGS.language.body}</p>
          </>
        ) : (
          <p className="tw-muted">{SETTINGS.language.english}</p>
        )}
      </section>

      <div className="tw-row">
        <button type="button" className="tw-btn" onClick={() => void closeThisTab()}>
          {SETTINGS.back}
        </button>
        <p className="tw-ok" role="status" aria-live="polite" style={{ fontWeight: 700 }}>
          {status}
        </p>
      </div>
    </Split>
  );
}

mount(<SettingsPage />);
