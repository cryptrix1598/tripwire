/**
 * Local cache of the active config, shared by every extension context through
 * chrome.storage.local. Always returns a complete, valid config.
 */
import { DEFAULT_CONFIG, mergeConfig, type TripwireConfig } from './defaults';

const KEY = 'tripwire.config';

export async function loadConfig(): Promise<TripwireConfig> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    return mergeConfig(stored[KEY]);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: TripwireConfig): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: config });
  } catch {
    // Storage being unavailable must never break protection.
  }
}

/** Call back whenever Remote Config publishes a new value into storage. */
export function onConfigChange(cb: (config: TripwireConfig) => void): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) cb(mergeConfig(changes[KEY].newValue));
    });
  } catch {
    // ignore
  }
}
