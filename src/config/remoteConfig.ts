/**
 * Remote Config: thresholds, prompt version, cloud model and keyword lists can
 * all be tuned from the Firebase console without shipping a new extension.
 *
 * One parameter, `tripwire_config`, holds a JSON object with any subset of the
 * keys in TripwireConfig. Missing or malformed values fall back to the local
 * defaults (see mergeConfig), so a bad publish can never break protection.
 *
 * Fetched in a document context (offscreen document or an extension page) and
 * cached in chrome.storage.local, where the content script and service worker
 * read it synchronously-enough via store.ts.
 */
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { getFirebaseApp } from '../firebase/app';
import { mergeConfig, type TripwireConfig } from './defaults';
import { saveConfig } from './store';

export const REMOTE_CONFIG_KEY = 'tripwire_config';
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export async function refreshRemoteConfig(): Promise<{ config: TripwireConfig; source: 'remote' | 'default' }> {
  const rc = getRemoteConfig(getFirebaseApp());
  rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : TWELVE_HOURS;
  rc.settings.fetchTimeoutMillis = 10_000;
  rc.defaultConfig = { [REMOTE_CONFIG_KEY]: '{}' };

  await fetchAndActivate(rc);
  const value = getValue(rc, REMOTE_CONFIG_KEY);
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(value.asString() || '{}');
  } catch {
    parsed = {};
  }
  const config = mergeConfig(parsed);
  await saveConfig(config);
  return { config, source: value.getSource() === 'remote' ? 'remote' : 'default' };
}
