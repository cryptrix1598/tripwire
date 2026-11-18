# Publishing Tripwire on the Chrome Web Store

Everything the Chrome Web Store asks for is ready below. Two steps need you: registering as a developer (a one-time US$5 fee, on your own Google account) and pressing **Submit for review**. Review usually takes a few days, so submit well before 30 November.

## 1. Build the package

```bash
npm run zip:store
```

This makes `.output/tripwire-0.1.0-chrome-store.zip`. It is a release build with **no App Check debug token**: the script checks every file and stops if the token is there. App Check in this build comes from a real reCAPTCHA Enterprise check on the hosted site (see [src/firebase/attest.ts](../src/firebase/attest.ts)).

Before you upload, check it once in your own Chrome (one minute):

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `.output/chrome-mv3-store`.
2. Click the Tripwire icon, then **Developer checks**, then **Refresh status**.
3. `"appCheckToken": "valid"` means the free App Check path works in a real browser. Remove the unpacked copy afterwards.

## 2. Register and upload

1. Go to https://chrome.google.com/webstore/devconsole, sign in, pay the one-time fee and verify your email.
2. Click **New item** and upload the zip.

## 3. Store listing (copy and paste)

**Name:** Tripwire: a calm second look before you act

**Summary (up to 132 characters):**
Steps in at the moment a scam asks for money or details. Checks privately on your own computer first. Free and open source.

**Category:** Tools (Privacy & Security if offered) · **Language:** English

**Description:**

> Most scams do not take your money when you read them. They take it when you act: when you type a card number, buy gift cards, call "support", or install a program that lets a stranger into your computer. Tripwire stays quiet until that moment, then gives you a calm second look.
>
> • It pauses you before you type a card number, gift card code or crypto address on a page that looks like a scam, before you call a number a scam page pushes, and before you install a remote-access program.
> • Someone on the phone? Open Tripwire, choose "Someone is on the phone with me" and type what the caller wants. It tells you plainly whether to hang up.
> • Private by design. On computers that can run Google's on-device AI (Gemini Nano in Chrome), the check happens on your computer and nothing is sent. Otherwise names, numbers and addresses are removed first, and you can see exactly what was sent.
> • Plain words, large text, one clear button. In English, Spanish and French.
> • Family alerts (optional): a son, daughter or friend can be told when Tripwire steps in, without ever seeing your emails, the pages you visit, or anything you type.
>
> Tripwire is free, has no ads and never sells data. Source code: https://github.com/cryptrix1598/tripwire

**Images** (in [store/](../store), made by `node scripts/make-store-assets.mjs`):

| Field | File |
| --- | --- |
| Store icon (128×128) | `store/icon-128.png` |
| Screenshots (1280×800), in this order | `store/screenshot-1-on-device-pause.png` … `store/screenshot-5-settings.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `store/promo-marquee-1400x560.png` |

**Official URL / homepage:** https://tripwire-buildhybridai.web.app · **Support URL:** https://github.com/cryptrix1598/tripwire/issues

## 4. Privacy practices tab (copy and paste)

**Single purpose:**
Tripwire warns people at the moment they are about to act on a scam (typing a card number, paying with gift cards or crypto, calling a number, or installing remote-access software), and lets them check a phone call they are on.

**Permission justifications:**

| Permission | Why |
| --- | --- |
| Content scripts on all sites (`http://*/*`, `https://*/*`) | A scam can be on any site or in any webmail message. Tripwire reads the visible text of the page to spot warning signs, and notices when the person starts typing into a card, gift card or wallet field. |
| `storage` | Keeps the person's settings and trusted sites, and the verdict for an open tab until it closes. |
| `offscreen` | Gemini Nano (Chrome's Prompt API) and the Firebase SDK cannot run in a service worker, so they run in an offscreen document. It also holds a frame of Tripwire's own site that proves to Firebase App Check that this is a real browser. |
| `downloads` | Pauses a download of a remote-access program (a common step in tech-support scams) until the person confirms. |
| `activeTab` | Lets the toolbar menu show the verdict for the tab the person is looking at. |

**Remote code:** No, Tripwire does not use remote code. (The hidden frame is an ordinary web page of Tripwire's site; no script is loaded into the extension.)

**Data usage, tick these:**
- **Website content**: yes. Page text is read on the device; when a second opinion is needed it is sent with personal details removed, to Google's Gemini model through Firebase AI Logic.
- **Personal communications**: yes, only the text of an opened email message, handled the same way.
- Everything else (personally identifiable information, health, financial and payment information, authentication information, location, web history, user activity): **no**. Card numbers typed into a page are never read.

Then tick all three certifications (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** https://tripwire-buildhybridai.web.app/privacy.html

## 5. Distribution

Visibility **Public**, all regions, free. Press **Submit for review**.

When it is approved, put the store link in the README and the Devpost submission. If you would rather not wait for review, choose **Unlisted**: it gets a working install link that only people with the link can see. Review is still required.
