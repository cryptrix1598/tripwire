# Tripwire: design system

One look across the in-page UI, the extension pages and the family page. Tokens and components live in [src/ui/tripwire.css](src/ui/tripwire.css) and [src/ui/kit.tsx](src/ui/kit.tsx); every word is in [src/ui/copy.ts](src/ui/copy.ts).

## Direction

"Harbour light." A deep harbour-blue field owns one region of each screen and carries the single headline. Amber is the only signal colour and is never decoration. Everything else is pale, large and still. The tripped state is deep blue, not red: the aim is to slow someone down, not frighten them further.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--tw-deep` | `#14344D` | The deep field, primary buttons |
| `--tw-ink` | `#0E2233` | Text |
| `--tw-ground` | `#EEF3F6` | Page background |
| `--tw-surface` | `#FFFFFF` | Cards, the feed |
| `--tw-text-2` | `#34495a` | Secondary text |
| `--tw-signal` | `#F0B429` | The signal: mark, focus ring, banner border, progress |
| `--tw-signal-soft` | `#FFF3D1` | Banner background, "continued anyway" row |
| `--tw-ok` | `#17553b` | "They stopped", "On" |

Route dots: green (on device), orange (redacted, then cloud), blue (no on-device AI), grey (rules only). A dot never stands alone; the words beside it say the same thing.

## Type

Atkinson Hyperlegible, 400 and 700, bundled (no network font). Body 18 to 20px, lead 22px, headings 30 to 68px with tight leading. 16px appears only for secondary lines in the popup and the family page. Sizes are px so the in-page UI is not affected by a host page's root size.

## Layout

- **Split**: deep field left (mark, headline, one status line), content right. Stacks under about 980px. Used by the pause, "you stopped", onboarding and sign-in.
- **Top bar + content**: family page and developer checks.
- **Banner**: fixed, centred, 900px max, over the page; the page stays usable.
- No label above headings. No cards inside cards. Lists and rows before boxes.

## Components

- **Primary button**: deep fill, 60 to 72px tall, 14px radius. One per screen.
- **Quiet link**: underlined text, 48px tall hit area. Used for "I'm sure, continue", Back, Skip, Dismiss.
- **Route line**: dot, bold label, detail. The same sentence wherever a verdict is shown.
- **Flag list**: short dash, one plain sentence each, five at most.
- **Alert row**: when / what / outcome. "Continued anyway" differs by colour, icon and wording.

## Principles per screen

| Screen | What governs it |
| --- | --- |
| Caution banner | One sentence, never blocks the page, detail behind "Why?" |
| Pause | One question, one obvious safe action, a quieter way through; focus starts on the safe button; the page behind is made inert |
| "You stopped" | Praise first, then three concrete steps; no decision asked |
| Onboarding | One idea per screen; the privacy promise is shown as a before and after, not only claimed |
| Popup | Three facts, two actions |
| Family page | Rows that answer "are they OK?"; what a guardian cannot see is stated on the page |
| Settings | Three plain choices, saved as they change; the warning level is three named steps, not a score; the trusted-sites list carries a warning written for how a scammer would abuse it |
| Android app | The same tokens and wording as the web family page; every AI suggestion says where it was written |

## Showing the work

Every verdict carries a route line. When anything was sent, "See exactly what was sent" opens the redacted request text in a plain monospace block, so the privacy claim can be checked by reading it. The in-page interface follows the browser language (English, Spanish, French).

## Accessibility

Focus ring 4px amber (deep blue on the amber banner). Targets 44px or larger. The pause is an `alertdialog`; the banner is a polite live region. Motion is a 200 to 280ms fade or drop on arrival only, removed under `prefers-reduced-motion`.
