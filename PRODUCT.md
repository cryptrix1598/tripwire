# Tripwire: product record

Inferred from the hackathon build brief, not from user research. Treat the audience notes as assumptions to test.

## Who it is for

- **The protected person (primary).** An adult in their seventies or older, comfortable with email and shopping online, not with security jargon. When Tripwire appears they are likely frightened and being rushed, often with a stranger on the phone.
- **The guardian (secondary).** An adult child or relative. Wants to know something happened without reading a parent's mail. Checks the family page occasionally, on a phone or laptop.

## What it must do for them

1. Stay out of the way. A safe page shows nothing.
2. At the moment of action, slow the person down with one question they can answer truthfully.
3. Make the safe choice the easy one and the risky choice possible but deliberate.
4. Say honestly what left the device, every time.
5. Tell the guardian that it happened, never what was read or typed.

## Voice

Short, plain, kind. Say what is happening, then what to do. No jargon ("phishing", "malware"), no blame, no shouting, no exclamation marks. A real bank lets you take your time; Tripwire sounds like that.

## What it must never feel like

- Antivirus software: red shields, skulls, sirens, flashing, countdowns.
- Surveillance: nothing that suggests a relative can watch the screen.
- A nag: no scores, streaks, tips or upsell.

## Constraints

- Body text 18px or larger on anything the protected person sees; targets 44px or larger; WCAG AA at minimum, AAA for the key sentences.
- Respects `prefers-reduced-motion`. Nothing moves except a short fade when the banner arrives.
- English only. All copy lives in `src/ui/copy.ts`.
