# Devpost submission: Tripwire

Copy for the #BuildHybridAI 2026 submission form, plus a script for the demo video (3 minutes at most).

- **Tracks:** Web / Chrome. The repo also has an Android app ("Is this a scam?" for the person, and the family viewer); it builds and its unit tests pass, but it has not been run on a phone yet.
- **Repository:** https://github.com/cryptrix1598/tripwire (Apache-2.0)
- **Hosted family page:** https://tripwire-buildhybridai.web.app
- **Install the extension without building:** https://github.com/cryptrix1598/tripwire/blob/main/release/tripwire-chrome.zip (unzip, then Load unpacked in chrome://extensions)
- **Try it with nothing to install:** https://tripwire-buildhybridai.web.app/demo/ (the practice pages run Tripwire in the page, through Firebase AI Logic)

## In three lines

1. **Gemini Nano is the privacy gate, not just the fast path.** It decides most pages on the computer; when it is unsure, it points out the personal details, code removes them, a leak check runs, and only then does a copy go to the cloud model. A receipt shows the person exactly what was sent. On our corpus: the same 25 of 25 scams caught, with 3,664 bytes sent instead of 22,018 (83 percent less).
2. **It steps in at the moment money would leave,** not when a page loads: a card box, a gift-card code, a crypto wallet, a remote-access download, a phone link, a transfer to a new payee on the person's own bank, or gift cards worth $200+ in a real store's cart. The pause asks one question and holds "continue" for five minutes, and the family can answer the hold from their own page.
3. **It is built against the scammer's script:** no pairing code within an hour of a warning, a newly paired family member cannot release a hold, and lowering protection alerts the family.

Why the modes are pinned instead of `PREFER_ON_DEVICE`: each step has one place it is allowed to run (triage, redaction and translation on the device, analysis in the cloud), and Tripwire checks `inferenceSource` after every on-device call, so a private step can never quietly run in the cloud.

On public data we did not write (300 texts from the UCI SMS Spam Collection): 0 false alarms in 150 ordinary texts, 37 of 150 spam flagged; most missed spam is marketing, and 21 "you have won, call this number" texts are a gap we name.

- **Built during the submission period:** first commit 14 Nov 2026; everything here was written between 14 and 30 Nov 2026.

## Tagline

Tripwire steps in at the exact moment you're about to fall for a scam (on a page, in an email, or on the phone) and protects your privacy while doing it.

## Inspiration

Scams aimed at older adults do not work by being read. They work when someone acts: types a card number, buys gift cards, installs a "support" tool, or calls the number on the screen, usually with a stranger rushing them. Existing protection either blocks known bad sites (and misses the email that arrived this morning) or reads everything you do in the cloud. We wanted something that waits for the moment that matters, and that an older person could trust with their inbox.

## The problem, in the FTC's numbers

Fraud losses reported by older adults in the US rose from about $600 million in 2020 to about $3 billion in 2025. Reports from older adults who lost $10,000 or more to business or government imposters rose more than fourfold between 2020 and 2024, and older adults were more than twice as likely as younger adults to report a loss that size. The pattern the FTC describes is a false alarm followed by pressure to move money "to protect it". (Sources: FTC consumer alert of 4 November 2026 and FTC Data Spotlight of August 2025; links in the README.)

## What it does

Tripwire is a Chrome extension with three states.

- **Safe:** nothing is shown. No badge, no banner.
- **Caution:** a deep-blue warning band with one plain sentence and a "Why?" button.
- **Tripped:** a full-page pause that asks one question: *did someone call, text, or email you and ask you to do this?* "Stop and stay safe" is the large button; "I'm sure, continue" is a quiet link.

**The urgency breaker.** Scams run on one weapon: "act now." For the asks that are never legitimate when someone contacts you (buying gift cards, sending crypto or a wire, installing a remote-access program), the pause holds "continue" for five minutes: *"Real emergencies can wait 5 minutes. Scams can't."* It tells the person to hang up first, then call the number on their card. Nothing can make the hold shorter, a reload does not restart or skip it (it is kept per tab and page in the extension, out of the page's reach), and "I'm still not sure" adds five more minutes. If someone in the family is paired, they see the hold on their family page or phone and can answer it once: **"Keep it on hold for 30 minutes"** so there is time to call, or, after talking to them, **"Let it go through"**. The wait becomes a second opinion from a person they trust, not just a timer. The security rules allow exactly those two answers, only from an approved family member, only while the hold runs, and the hold record holds nothing but the kind of step and the times ([firestore.rules](firestore.rules)). Ordinary shopping never sees it ([src/ui/hold.ts](src/ui/hold.ts)).

**Your own bank.** The costliest scams end on the person's real bank site: "your account is compromised, move your savings to a safe account." Nothing on that page looks wrong, because the story is told on the phone, so Tripwire watches the moment instead. When someone starts a transfer (a payee, routing, IBAN, sort code, wire or amount box in a form about sending money) to a **new payee**, or within an hour of a scam warning or a phone-call check on this computer, it pauses with one question, *"Is someone on the phone telling you to move money?"*, and holds "continue" for five minutes. Gemini Nano reads the transfer form **on the device only** (this is their bank; nothing goes to the cloud here), together with a built-in rule for the stories scammers use (a "safe account", moving all your savings, crypto, gift cards, a refund transfer), so the pause can show the most specific reason it has. A transfer to someone they have paid before, with nothing suspicious that hour, is never interrupted ([src/tripwires/transfer.ts](src/tripwires/transfer.ts), `assessTransfer` in [src/inference/router.ts](src/inference/router.ts); practice page: `transfer.html`; field wording from real US, UK, Spanish and French bank forms is tested in [tests/transfer-real.test.ts](tests/transfer-real.test.ts)).

**When protection is turned down.** Scammers coach people into switching protection off: "add our site to your safe list", "turn that warning down", "remove that program." Paired family members get an alert when a site is marked as trusted or the warning level is lowered, each with its own fixed sentence pinned in the security rules. The computer also says "still here" twice a day, so the family page shows when Tripwire last checked in and, after three silent days, suggests a call. If Tripwire is removed, Chrome opens a page that says: if someone on the phone told you to do this, that call is a scam; hang up.

It trips on actions: a card number field (checked locally), a gift-card code field, a crypto wallet field, a phone link, and the download of a remote-access tool. On a page that has not been checked yet, or has changed since, the field or the phone link is held until the check answers. A remote-access download always asks, once per tool, even with no suspicious page open.

**Settings** give a three-step warning level and a list of trusted sites, with a warning aimed at the exact way a scammer would try to abuse that list. **Explanations follow the browser's language**: a verdict that stayed on the device is translated on the device, so "nothing left your computer" stays true.

**Someone on the phone?** Most scams on older people start with a call, which no browser can see. From the Tripwire menu, "Someone is on the phone with me" opens a page where the person answers three questions by tapping big buttons, with no typing: who the caller says they are, what they want (money, gift cards, crypto, a code from the phone, personal details, access to the computer) and how they are acting (rushing, secrecy, "stay on the line"). Tripwire turns the taps into a plain English description, plus anything the person chooses to type, so the model reads clear English whatever language the screen is in. Gemini Nano checks it on the computer first (a redacted second opinion only if it is unsure), and the answer is plain: "Hang up now.", "Be careful." or "Nothing here sounds like a scam", always with "call back on a number you already know". "I hung up" sends the family alert.

**On the phone too.** The Android app adds **Is this a scam?** for the person being protected: share a text or an email to it, or tap what a caller wants. Gemini Nano reads it on the phone first (`ONLY_ON_DEVICE`, with `inferenceSource` checked); only an unsure case goes to the cloud (`ONLY_IN_CLOUD`), redacted and leak-checked. A caller who wants gift cards, crypto, a code, access or a "safe account" move gets "Hang up now" at once.

**Family Guardian** is optional, and a guessed code is useless: nothing is shared until the person taps "Yes, allow" on their own computer. The person shows an eight-digit code, a relative types it on the family page, and from then on sees that Tripwire stepped in: the time, the kind of scam, the action, and whether they stopped. Never the page, the email, or anything typed.

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

- **Main corpus (25 scams, 25 ordinary messages), Gemini Nano inside the built extension (latest run, 28 Nov):** 25 of 25 flagged, 0 false alarms. 35 of the 50 were decided on the device, 8 needed no model and 7 went to the cloud: 3,664 redacted bytes sent, against 22,018 for the same corpus with no on-device model (83 percent less), with the same detection ([eval-results/extension-on-device.json](../eval-results/extension-on-device.json)).
- **The privacy gate, measured:** 3,664 redacted bytes left the device, against 22,018 when the same corpus runs with no on-device model. About 83 percent less, with the same detection.
- **Held-out test:** scam messages never used for tuning plus 36 real public pages fetched live (IRS, SSA and Apple pages about scams, Wikipedia, bank and payment sign-in pages, a remote-access vendor, news). First round: 16 of 16 scams flagged (14 of them on the device, nothing sent), 0 false alarms on the 28 pages that loaded, median check 3.7 seconds.
- **What the AI adds:** on the held-out set, the built-in rules alone catch 3 of 28 scams; with Gemini Nano first, 28 of 28; on a computer without Gemini Nano (the stricter gate, then the redacted cloud check), 26 of 28, and the run records why each miss happened. No false alarms on the real pages in any of the three.
- **A fresh round, run once:** ten new scams and ten ordinary messages written after every other change. Gemini Nano first: 8 of 10 caught, 0 false alarms; rules alone: 0 of 10. The two misses are published, then fixed with regression tests. Run again after the fixes (no longer held out): 10 of 10, 0 false alarms.
- **We publish the bad first run too.** Before the fixes it caught 6 of 10 and took 51 seconds on long pages. See "Challenges".
- **A third held-out round, written after all tuning and run once:** 12 of 12 new kinds of scam paused, 0 false alarms on 12 ordinary messages chosen to look like scams.
- **The built extension itself is what was measured above**, loaded over the DevTools protocol with Gemini Nano running in its offscreen document.
- Every screen in English, Spanish and French; explanations run live in Spanish and French with nothing sent.
- Fourteen hostile-page tests: a page that tells the model what to answer, repeats "scam" (or "this is not a scam") to look like advice, hides the ask under filler, or deletes the warning. None gets through quietly.
- 294 unit tests (plus 38 for the Android app), 42 security-rules tests (including a limit of one family alert every 15 seconds, a pairing code that cannot be used up without creating a family link, and a family name that cannot carry a phone number), a 15-step end-to-end run, a live run against the real project, a test of the hosted demo with no extension, and an axe-core audit on every screen (WCAG 2.2 AA: 0 problems).

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

Running the Android app on real phones (its "Is this a scam?" check for texts and calls, and the family viewer), push alerts, more languages than English, Spanish and French, and testing with older users and their families.

---

## Demo video (2:30) and voice-over script

The film is `video/tripwire-demo-4k60.mp4` (3840x2160, 60 fps), recorded by `scripts/demo-video.mjs` in Chrome with Gemini Nano (the two family scenes in Chromium against the live Firebase project) and cut by `scripts/demo-edit.py`. Every scene is captioned. Read the lines below at a calm pace; each fits its scene.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00 | "Your mom gets a call…" | "Your mom gets a call. Her bank account has been hacked, the caller says. Move your savings to a safe account, and don't tell anyone." |
| 0:07 | The problem | "Scams like this cost older Americans billions every year. Tripwire steps in at the moment the money would leave." |
| 0:13 | A fake bank text, paused | "A fake bank text. Gemini Nano reads it on the computer and pauses the page with one question: did someone ask you to do this? The badge says it plainly: checked on your device, nothing left your computer. Why? shows the reasons, and the safe button ends it." |
| 0:33 | Internet cut off | "Here the internet is cut off for the whole browser. The scam email is still paused, because the decision is made on the computer." |
| 0:42 | An ordinary checkout | "An ordinary checkout. A quick check, then nothing, even while a card number is typed." |
| 0:49 | Fake tech support | "Fake tech support. The phone link is paused before it dials." |
| 0:59 | Gift-card code | "Pay us in gift cards: the code box is paused." |
| 1:06 | Crypto | "An investment that cannot lose: the wallet box is paused." |
| 1:13 | Gift cards at a store | "Gift cards at a real store. An eight-hundred-dollar cart gets the question, and continue waits five minutes." |
| 1:21 | Their own bank | "Their own bank, a new payee. The page looks normal, because the story is told on the phone, so the moment decides: one question and a five-minute hold." |
| 1:28 | The family page | "Their family sees the hold on their own page and keeps it on hold for thirty minutes." |
| 1:41 | The pause updates | "Back on Mom's computer, the pause says her family asked her to wait." |
| 1:45 | Is this call a scam? | "During a call, she taps what the caller is saying. No typing. Tripwire says hang up now. Here the cloud was asked for a second opinion, so she can see exactly what was sent: personal details already removed on the computer." |
| 2:13 | How the hybrid works | "Gemini Nano decides on the computer. Only when it is unsure does a redacted copy go to the cloud. Same detection, eighty-three percent less data sent." |
| 2:22 | Close | "Tripwire. Free and open source, in English, Spanish and French, for Chrome." |
