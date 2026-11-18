/**
 * Interface language. English is the source of truth (copy.ts). For other
 * languages, everything the protected person sees in the page is replaced:
 * the banner, the pause, the reasons, the route badges and the "you stopped"
 * page. Setup, settings and the family page stay in English for now.
 *
 * applyLocale() rewrites the copy objects in place, once, before anything is
 * drawn, so no component needs to know about languages.
 */
import * as copy from './copy';
import { ES } from './locales/es';
import { FR } from './locales/fr';

type Loose<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Loose<R>
  : T extends string
    ? string
    : T extends readonly (infer U)[]
      ? readonly Loose<U>[]
      : T extends object
        ? { -readonly [K in keyof T]?: Loose<T[K]> }
        : T;

const GROUPS = [
  'ROUTE_BADGE', 'CAUTION_HEADLINE', 'BANNER', 'TRIP_LEAD', 'INTERSTITIAL', 'WHY', 'RULE_FLAG', 'EXPLANATION', 'SAFE_PAGE', 'DOWNLOAD_PAUSE',
  // Setup, the menu, settings and the family page.
  'ONBOARDING', 'POPUP', 'SETTINGS', 'DASHBOARD', 'SCAM_TYPE_LABEL', 'TRIGGER_LABEL', 'OUTCOME_LABEL', 'ALERT_SUMMARY_SHOWN', 'CALL',
] as const;
type Group = (typeof GROUPS)[number];
export type LocaleBundle = { [K in Group]?: Loose<(typeof copy)[K]> };

const BUNDLES: Record<string, LocaleBundle> = { es: ES, fr: FR };
export const SUPPORTED_LOCALES = ['en', ...Object.keys(BUNDLES)] as const;

type Tree = Record<string, unknown>;
const isTree = (value: unknown): value is Tree => typeof value === 'object' && value !== null && !Array.isArray(value);

function clone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clone);
  if (isTree(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}

function assign(target: Tree, source: Tree): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (isTree(value) && isTree(current)) assign(current, value);
    else target[key] = clone(value);
  }
}

const groups = copy as unknown as Record<Group, Tree>;
/** The English originals, kept so a locale can always be undone. */
const ENGLISH = Object.fromEntries(GROUPS.map((g) => [g, clone(groups[g]) as Tree])) as Record<Group, Tree>;
let current = 'en';

/** Switch the in-page copy to the browser's language when Tripwire has it. Returns the language now in use. */
export function applyLocale(tag: string | undefined): string {
  const code = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
  const next = code in BUNDLES ? code : 'en';
  if (next === current) return current;
  for (const group of GROUPS) assign(groups[group], ENGLISH[group]);
  const bundle = BUNDLES[next];
  if (bundle) for (const group of GROUPS) if (bundle[group]) assign(groups[group], bundle[group] as Tree);
  current = next;
  return current;
}

export function currentLocale(): string {
  return current;
}
