/**
 * The person's own settings: how careful Tripwire should be, which sites they
 * trust, and whether reasons are written in their browser's language.
 *
 * Kept deliberately small. They live in chrome.storage.local on this computer
 * and are applied in one place (the service worker and the AI host), so the
 * content script cannot be talked out of checking a page.
 */
import { z } from 'zod';
import type { TripwireConfig } from './defaults';

export const SENSITIVITY = ['fewer', 'standard', 'more'] as const;
export type Sensitivity = (typeof SENSITIVITY)[number];

export const SettingsSchema = z.object({
  sensitivity: z.enum(SENSITIVITY),
  trustedSites: z.array(z.string()).max(200),
  explainInBrowserLanguage: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = { sensitivity: 'standard', trustedSites: [], explainInBrowserLanguage: true };
const KEY = 'tripwire.settings';

/** Endings that cover many unrelated sites; trusting one of these would trust half the web. */
const SHARED_ENDINGS = /^(?:co|com|org|net|gov|ac|edu)\.[a-z]{2}$/;
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Turn what someone typed ("https://www.MyBank.com/login") into a bare site
 * name ("mybank.com"). Returns null for anything that is not one site.
 */
export function normalizeSite(input: string): string | null {
  let site = input.trim().toLowerCase();
  site = site.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^/@]*@/, '');
  site = (site.split(/[/?#]/)[0] ?? '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (site === 'localhost') return site; // a developer's own machine, used by the practice pages
  if (!HOST.test(site) || SHARED_ENDINGS.test(site)) return null;
  return site;
}

/** A trusted entry covers that site and its subdomains, never a look-alike. */
export function isTrusted(hostname: string, sites: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return sites.some((site) => host === site || host.endsWith(`.${site}`));
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Shift the thresholds for the chosen level. "standard" returns the config unchanged. */
export function applySensitivity(config: TripwireConfig, sensitivity: Sensitivity): TripwireConfig {
  if (sensitivity === 'standard') return config;
  const shift = sensitivity === 'more' ? -10 : 10;
  const t = config.thresholds;
  const low = clamp(t.low + shift, 10, 60);
  return {
    ...config,
    thresholds: {
      ...t,
      low,
      high: clamp(t.high + shift / 2, low + 15, 95),
      minCorroboration: clamp(t.minCorroboration + shift, 10, 90),
      rulesOnlyCaution: clamp(t.rulesOnlyCaution + shift, low, 95),
    },
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY];
    const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(stored as object | undefined) });
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: SettingsSchema.parse(settings) });
}
