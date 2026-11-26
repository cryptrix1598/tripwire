# Devpost submission: Tripwire

Copy for the #BuildHybridAI 2026 submission form, plus a script for the demo video (3 minutes at most).

- **Tracks:** Web / Chrome (primary). An Android companion app is included in the repo; it builds and is unit-tested but had not been run on a device when this was written, so only claim Android if you have run it on a phone.
- **Repository:** https://github.com/cryptrix1598/tripwire (Apache-2.0)
- **Hosted family page:** https://tripwire-buildhybridai.web.app
- **Install the extension without building:** https://github.com/cryptrix1598/tripwire/blob/main/release/tripwire-chrome.zip (unzip, then Load unpacked in chrome://extensions)
- **Try it with nothing to install:** https://tripwire-buildhybridai.web.app/demo/ (the practice pages run Tripwire in the page, through Firebase AI Logic)

## Tagline

Tripwire steps in at the exact moment you're about to fall for a scam (on a page, in an email, or on the phone) and protects your privacy while doing it.

## Inspiration

Scams aimed at older adults do not work by being read. They work when someone acts: types a card number, buys gift cards, installs a "support" tool, or calls the number on the screen, usually with a stranger rushing them. Existing protection either blocks known bad sites (and misses the email that arrived this morning) or reads everything you do in the cloud. We wanted something that waits for the moment that matters, and that an older person could trust with their inbox.

## The problem, in the FTC's numbers

Fraud losses reported by older adults in the US rose from about $600 million in 2020 to about $3 billion in 2025. Reports from older adults who lost $10,000 or more to business or government imposters rose more than fourfold between 2020 and 2024, and older adults were more than twice as likely as younger adults to report a loss that size. The pattern the FTC describes is a false alarm followed by pressure to move money "to protect it". (Sources: FTC consumer alert of 4 November 2026 and FTC Data Spotlight of August 2025; links in the README.)

## What it does

Tripwire is a Chrome extension with three states.

- **Safe:** nothing is shown. No badge, no banner.
- **Caution:** a calm amber banner with one plain sentence and a "Why?" button.
- **Tripped:** a full-page pause that asks one question: *did someone call, text, or email you and ask you to do this?* "Stop and stay safe" is the large button; "I'm sure, continue" is a quiet link.

It trips on actions: a card number field (checked locally), a gift-card code field, a crypto wallet field, a phone link, and the download of a remote-access tool. On a page that has not been checked yet, or has changed since, the field or the phone link is held until the check answers. A remote-access download always asks, once per tool, even with no suspicious page open.

**Settings** give a three-step warning level and a list of trusted sites, with a warning aimed at the exact way a scammer would try to abuse that list. **Explanations follow the browser's language**: a verdict that stayed on the device is translated on the device, so "nothing left your computer" stays true.

**Someone on the phone?** Most scams on older people start with a call, which no browser can see. From the Tripwire menu, "Someone is on the phone with me" opens a page where the person answers three questions by tapping big buttons, with no typing: who the caller says they are, what they want (money, gift cards, crypto, a code from the phone, personal details, access to the computer) and how they are acting (rushing, secrecy, "stay on the line"). Tripwire turns the taps into a plain English description, plus anything the person chooses to type, so the model reads clear English whatever language the screen is in. Gemini Nano checks it on the computer first (a redacted second opinion only if it is unsure), and the answer is plain: "Hang up now.", "Be careful." or "Nothing here sounds like a scam", always with "call back on a number you already know". "I hung up" sends the family alert.

**On the phone too.** The Android app adds **Is this a scam?** for the person being protected: share a text or an email to it, or tap what a caller wants. Gemini Nano reads it on the phone first (`ONLY_ON_DEVICE`, with `inferenceSource` checked); only an unsure case goes to the cloud (`ONLY_IN_CLOUD`), redacted and leak-checked. A caller who wants gift cards, crypto, a code, access or a "safe account" move gets "Hang up now" at once.

**Family Guardian** is optional, and a guessed code is useless: nothing is shared until the person taps "Yes, allow" on their own computer. The person shows a eight-digit code, a relative types it on the family page, and from then on sees that Tripwire stepped in: the time, the kind of scam, the action, and whether they stopped. Never the page, the email, or anything typed.

## How we used Firebase AI Logic

The on-device model is not a cheaper copy of the cloud model. It is a **privacy gate in front of it**.

1. Built-in warning signs (plain rules, no AI) decide whether a page is worth checking at all. Most pages never reach a model.
2. **Gemini Nano on the device**, called through Firebase AI Logic with `InferenceMode.ONLY_ON_DEVICE`, scores the page. Clearly safe pages stop here. Clear scams trip here, with zero bytes sent.
3. Only when the device is unsure does anything leave: the text is redacted by regular expressions, then by the on-device model, then by regular expressions again, and checked for leaks. If the check fails, nothing is sent.
4. **Gemini in the cloud**, called through Firebase AI Logic with `InferenceMode.ONLY_IN_CLOUD`, sees redacted text only and returns a structured verdict.

The person can open "See exactly what was sent" and read the redacted text for themselves. Every verdict carries its route, and the person sees it in plain words: "Checked on your device · nothing left your computer", or "Personal info removed · sent for a deeper check". We pin the inference mode for each call instead of using `PREFER_ON_DEVICE`, and check `response.inferenceSource`: if a call that must stay local was answered by the cloud, the result is thrown away.

Other Firebase pieces:

- **App Check**, enforced on both AI Logic and Firestore. reCAPTCHA cannot load on a `chrome-extension://` origin under Manifest V3, so the release build uses a custom provider whose tokens come from Tripwire's own hosted page: a hidden frame on `/attest.html` passes a real reCAPTCHA Enterprise check and hands back an App Check token. The page answers only Tripwire's fixed extension ID, and the release build contains no debug token (the build script checks). Development and automated test builds use a debug token, because reCAPTCHA refuses automated browsers. The hosted family page attests with reCAPTCHA Enterprise. We tested enforcement from outside: an AI Logic request without a token gets HTTP 401 and a Firestore read without a token is refused.
- **Remote Config** holds thresholds, the prompt version and keyword lists, with local defaults.
- **Auth** (anonymous) is the device identity; **Firestore** holds pairing codes and alerts. The security rules reject any alert that is not exactly five fixed fields, so page or email text cannot be stored even by a modified client. The rules have their own test suite.
- **Hosting** serves the family page.

Chrome's Prompt API is not available in service workers, so inference runs in an offscreen document.

## How we built it

TypeScript (strict), Manifest V3 with WXT, React, Shadow DOM for the in-page UI, the Firebase JS SDK (`firebase/ai`, App Check, Auth, Firestore, Remote Config), zod for validating model output. One file makes every AI call; one file holds every word of copy; one stylesheet holds the design tokens shared by the extension and the family page.

## Results

- **Main corpus (25 scams, 25 ordinary messages), Gemini Nano inside the built extension (26 Nov):** 25 of 25 flagged, 0 false alarms. 34 of the 50 were decided on the device, 8 needed no model and 8 reached the cloud.
- **The privacy gate, measured:** 4,207 redacted bytes left the device, against 22,018 when the same corpus runs with no on-device model. About 81 percent less, with the same detection.
- **Held-out test:** scam messages never used for tuning plus 36 real public pages fetched live (IRS, SSA and Apple pages about scams, Wikipedia, bank and payment sign-in pages, a remote-access vendor, news). Final result: 16 of 16 scams flagged (14 of them on the device, nothing sent), 0 false alarms on the 28 pages that loaded, median check 3.7 seconds.
- **We publish the bad first run too.** Before the fixes it caught 6 of 10 and took 51 seconds on long pages. See "Challenges".
- **A third held-out round, written after all tuning and run once:** 12 of 12 new kinds of scam paused, 0 false alarms on 12 ordinary messages chosen to look like scams.
- **The built extension itself is what was measured above**, loaded over the DevTools protocol with Gemini Nano running in its offscreen document.
- Every screen in English, Spanish and French; explanations run live in Spanish and French with nothing sent.
- Fourteen hostile-page tests: a page that tells the model what to answer, repeats "scam" (or "this is not a scam") to look like advice, hides the ask under filler, or deletes the warning. None gets through quietly.
- 203 unit tests (plus 16 for the Android app), 32 security-rules tests (including a limit of one family alert every 15 seconds, a pairing code that cannot be used up without creating a family link, and a family name that cannot carry a phone number), a 14-step end-to-end run, a live run against the real project, a test of the hosted demo with no extension, and an axe-core audit on every screen (WCAG 2.2 AA: 0 problems).

## Challenges

- **Our own test set flattered us.** A held-out run caught only 6 of 10 new scams: the keyword gate, tuned on our corpus, never showed four of them to a model. Long real pages took 51 seconds because the on-device model was given whole pages. We rebuilt the gate around the shape of a request (an ask for money or credentials, plus pressure, secrecy or a number to call), gave the models a short excerpt, and changed on-device redaction so the model lists personal details and code does the replacing. A second, fresh round of scams was then caught 6 of 6.
- **An article about a scam is not a scam.** One run paused the Wikipedia page on tech support scams. Pages that keep saying "scam" and "victim" now need the cloud model to agree before anything is shown.
- **False alarms.** A tool that cries wolf gets uninstalled by exactly the people who need it. A local-only trip needs the model's confidence and the rule score to agree, and the corpus run fails on a single false alarm.
- **App Check in an extension.** reCAPTCHA cannot load on `chrome-extension://`. The release build gets real tokens from a hidden frame on our own hosted page, which passes reCAPTCHA Enterprise and answers only Tripwire's fixed extension ID. No server and no paid plan; development and test builds use a debug token, because reCAPTCHA rightly refuses automated browsers.
- **Where the model can live.** Not in the service worker; the offscreen document is the answer.
- **"Continue" must be narrow.** Our first version remembered "I'm sure, continue" for a whole site, which in Gmail would have silenced every later email. It now applies to one page.

## What we learned

Test on data you did not write for. And hybrid inference is most interesting when the two halves do different jobs. Here the small model protects privacy and handles the easy cases; the large model handles the hard ones and never sees a name or a card number.

## What's next

Running the Android app on real phones (its "Is this a scam?" check for texts and calls, and the family viewer), push alerts, Spanish and French on Android, more languages than English, Spanish and French, and testing with older users and their families.

---

## Demo video script (about 2:45)

Record in desktop Chrome with the extension loaded and the on-device model downloaded. Use the hosted practice pages.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Title card, then the "message from your bank" practice page | "Scams don't take your money when you read them. They take it when you act. Tripwire waits for that moment." |
| 0:15 | An ordinary shop checkout; type a card number; nothing happens | "On a normal page, Tripwire shows nothing at all. No badge, no nagging." |
| 0:30 | The fake bank page; click the card number box; the pause appears | "Here, the moment I go to type my card number, it stops me and asks one question." |
| 0:50 | Click "Why did Tripwire stop me?"; point at the route badge | "It tells me why in plain words, and exactly what left my computer: checked on your device, zero bytes sent." |
| 1:05 | **Turn Wi-Fi off.** Open the fake tech-support page; it is still caught | "This is the on-device model through Firebase AI Logic. With no internet at all, it still catches it." |
| 1:25 | Wi-Fi back on. The "polite email about a refund" practice page; show the orange badge, then click "See exactly what was sent" | "When the device isn't sure, it removes names, numbers and addresses first, and only then asks the cloud model. And you can read exactly what was sent." |
| 1:45 | Tripwire menu → "Someone is on the phone with me"; tap "The government, Social Security or Medicare", "Give my Social Security, Medicare or bank details", "Rushing me or threatening"; "Hang up now." | "Most of these scams start with a phone call, and no browser can hear a call. So I just tap what the caller wants. No typing. It checks on my computer and tells me plainly: hang up." |
| 2:00 | Click the download button on the tech-support page; the paused-download tab | "It also pauses the download of a remote-access tool, the way these scams usually end." |
| 2:15 | "Stop and stay safe", then the family page updating live | "If I've paired a family member, they see that it happened and what kind of scam it was. Never my email, never what I typed." |
| 2:35 | The Developer checks page: corpus result, then the README held-out table | "Twenty-five of twenty-five, zero false alarms, and about eighty percent less data sent than a cloud-only check. On pages we did not write: sixteen of sixteen." |
| 2:45 | Title card with the repo address | "Tripwire. A calm second look before you act." |
