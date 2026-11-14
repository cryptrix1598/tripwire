# Devpost submission: Tripwire

Copy for the #BuildHybridAI 2026 submission form, plus a script for the demo video (3 minutes at most).

- **Track:** Web / Chrome
- **Repository:** https://github.com/cryptrix1598/tripwire (Apache-2.0)
- **Hosted family page:** https://tripwire-buildhybridai.web.app
- **Hosted practice pages:** https://tripwire-buildhybridai.web.app/demo/

## Tagline

Tripwire steps in at the exact moment you're about to fall for a scam, and protects your privacy while doing it.

## Inspiration

Scams aimed at older adults do not work by being read. They work when someone acts: types a card number, buys gift cards, installs a "support" tool, or calls the number on the screen, usually with a stranger rushing them. Existing protection either blocks known bad sites (and misses the email that arrived this morning) or reads everything you do in the cloud. We wanted something that waits for the moment that matters, and that an older person could trust with their inbox.

## What it does

Tripwire is a Chrome extension with three states.

- **Safe:** nothing is shown. No badge, no banner.
- **Caution:** a calm amber banner with one plain sentence and a "Why?" button.
- **Tripped:** a full-page pause that asks one question: *did someone call, text, or email you and ask you to do this?* "Stop and stay safe" is the large button; "I'm sure, continue" is a quiet link.

It trips on actions: a card number field (checked locally), a gift-card code field, a crypto wallet field, a phone link on a suspicious page, and the download of a remote-access tool shortly after a suspicious page was open.

**Family Guardian** is optional. The person shows a six-digit code, a relative types it on the family page, and from then on sees that Tripwire stepped in: the time, the kind of scam, the action, and whether they stopped. Never the page, the email, or anything typed.

## How we used Firebase AI Logic

The on-device model is not a cheaper copy of the cloud model. It is a **privacy gate in front of it**.

1. Built-in warning signs (plain rules, no AI) decide whether a page is worth checking at all. Most pages never reach a model.
2. **Gemini Nano on the device**, called through Firebase AI Logic with `InferenceMode.ONLY_ON_DEVICE`, scores the page. Clearly safe pages stop here. Clear scams trip here, with zero bytes sent.
3. Only when the device is unsure does anything leave: the text is redacted by regular expressions, then by the on-device model, then by regular expressions again, and checked for leaks. If the check fails, nothing is sent.
4. **Gemini in the cloud**, called through Firebase AI Logic with `InferenceMode.ONLY_IN_CLOUD`, sees redacted text only and returns a structured verdict.

Every verdict carries its route, and the person sees it in plain words: "Checked on your device · 0 bytes sent", or "Personal info removed · sent for a deeper check". We pin the inference mode for each call instead of using `PREFER_ON_DEVICE`, and check `response.inferenceSource`: if a call that must stay local was answered by the cloud, the result is thrown away.

Other Firebase pieces:

- **App Check**, enforced on AI Logic. reCAPTCHA cannot load on a `chrome-extension://` origin under Manifest V3, so the extension uses a custom provider with a debug token. We tested enforcement: the same request without a token gets HTTP 401.
- **Remote Config** holds thresholds, the prompt version and keyword lists, with local defaults.
- **Auth** (anonymous) is the device identity; **Firestore** holds pairing codes and alerts. The security rules reject any alert that is not exactly five fixed fields, so page or email text cannot be stored even by a modified client. The rules have their own test suite.
- **Hosting** serves the family page.

Chrome's Prompt API is not available in service workers, so inference runs in an offscreen document.

## How we built it

TypeScript (strict), Manifest V3 with WXT, React, Shadow DOM for the in-page UI, the Firebase JS SDK (`firebase/ai`, App Check, Auth, Firestore, Remote Config), zod for validating model output. One file makes every AI call; one file holds every word of copy; one stylesheet holds the design tokens shared by the extension and the family page.

## Results

- Test corpus of 25 scam and 25 ordinary messages.
- **With Gemini Nano on the device first (three runs): 25 of 25 scams flagged, 0 of 25 false alarms, every run.** 34 to 36 of the 50 samples were decided entirely on the device, 13 needed no model, and only 1 to 3 went to the cloud.
- **The privacy gate, measured:** 310 to 1,010 redacted bytes left the device per run, against 14,162 when the same corpus runs without the on-device model. That is a 93 to 98 percent cut in what is sent, with the same detection.
- Cloud path only (a device with no on-device AI): 25 of 25 flagged, 0 false alarms; 15 samples never sent, 35 redacted first.
- With no AI at all (offline, rules only): 23 of 25 flagged, 0 false alarms.
- 95 unit tests, 12 security-rules tests, an 11-step end-to-end run in Chromium, and an axe-core audit on every screen (WCAG 2.2 AA: 0 problems; all text meets AAA contrast).

## Challenges

- **False alarms.** A tool that cries wolf gets uninstalled by exactly the people who need it. A local-only trip needs the model's confidence and the rule score to agree, and the corpus run fails on a single false alarm.
- **App Check in an extension.** No reCAPTCHA on `chrome-extension://`; we documented the debug-token path and what a production token endpoint would look like.
- **Where the model can live.** Not in the service worker; the offscreen document is the answer.
- **"Continue" must be narrow.** Our first version remembered "I'm sure, continue" for a whole site, which in Gmail would have silenced every later email. It now applies to one page.

## What we learned

Hybrid inference is most interesting when the two halves do different jobs. Here the small model protects privacy and handles the easy cases; the large model handles the hard ones and never sees a name or a card number.

## What's next

Explanations in the browser's language, an Android companion for calls and texts, and a production App Check endpoint so the extension can ship in the Chrome Web Store.

---

## Demo video script (about 2:45)

Record in desktop Chrome with the extension loaded and the on-device model downloaded. Use the hosted practice pages.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Title card, then the fake bank email | "Scams don't take your money when you read them. They take it when you act. Tripwire waits for that moment." |
| 0:15 | An ordinary shop checkout; type a card number; nothing happens | "On a normal page, Tripwire shows nothing at all. No badge, no nagging." |
| 0:30 | The fake bank page; click the card number box; the pause appears | "Here, the moment I go to type my card number, it stops me and asks one question." |
| 0:50 | Click "Why did Tripwire stop me?"; point at the route badge | "It tells me why in plain words, and exactly what left my computer: checked on your device, zero bytes sent." |
| 1:05 | **Turn Wi-Fi off.** Open the fake tech-support page; it is still caught | "This is the on-device model through Firebase AI Logic. With no internet at all, it still catches it." |
| 1:25 | Wi-Fi back on. A subtler page that goes to the cloud; show the orange badge | "When the device isn't sure, it removes names, numbers and addresses first, and only then asks the cloud model." |
| 1:45 | Onboarding screen 2, the before-and-after redaction example | "That's the promise: your emails never leave your device unless personal info is removed first." |
| 2:00 | Click the download button on the tech-support page; the paused-download tab | "It also pauses the download of a remote-access tool, the way these scams usually end." |
| 2:15 | "Stop and stay safe", then the family page updating live | "If I've paired a family member, they see that it happened and what kind of scam it was. Never my email, never what I typed." |
| 2:35 | The Developer checks page: corpus result | "Twenty-five of twenty-five scams caught, zero false alarms, and over ninety percent less data sent than a cloud-only check." |
| 2:45 | Title card with the repo address | "Tripwire. A calm second look before you act." |
