# Demo video: script, recording setup, and what to click

Target length 2:30 (the limit is 3:00). Public YouTube link on Devpost.

## 1. Before you record (10 minutes, once)

1. **Install the extension.** Unzip `release/tripwire-chrome.zip`. In Chrome open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and pick the unzipped folder. Pin Tripwire: click the puzzle-piece icon in the toolbar, then the pin next to Tripwire.
2. **Finish setup.** The setup tab opens by itself. Click through it. On the family step, choose **Show a pairing code** and leave that tab open.
3. **Make sure Gemini Nano is ready.** Click the Tripwire icon. The private check line should say "On this computer". If it says "Needs a one-time download", leave Chrome open until it finishes. This is needed for the "nothing left your computer" shot.
4. **Family page.** In a second window, open `https://tripwire-buildhybridai.web.app/`. Type the code from step 2, a name for them ("Mom") and your first name ("Sam"). Go back to the setup tab and click **Yes, allow**. The family page now shows the alert feed.
5. **Browser zoom 125%** (Ctrl and +) on every tab you will show, so text is readable on a phone screen. Close other tabs and turn on Do Not Disturb.
6. **Practice pages** (safe, made for this): `https://tripwire-buildhybridai.web.app/demo/`. Open each once before recording so they load fast: `bank.html`, `support.html`, `giftcard.html`.

## 2. The script

Read slowly. Pause for about a second where the script says *[pause]*. Every on-screen line you quote should be visible while you say it.

**0:00–0:15. The hook.** *Screen: the family page with one alert, or a title card.*
> Older people lose three billion dollars a year to scams. The scam doesn't take the money when they read the message. It takes it when they act: when they type a card number, buy gift cards, or call the number on the screen. Tripwire steps in at exactly that moment.

**0:15–0:30. Why this is not the scam warning Chrome already has.** *Screen: the bank practice page, banner showing.*
> Browsers already warn about known bad sites. Tripwire is different. It watches for the action itself, it covers the phone call that most of these scams start with, and it tells the family. And it does all of that privately, with Gemini Nano on the computer first.

**0:30–1:05. The private on-device check.** *Screen: turn Wi-Fi off on camera (taskbar, network icon), then click into the card number box on `bank.html`.*
> Watch. I'm turning the Wi-Fi off. *[pause]* Now I'm about to type my card number on this fake bank page… *[pause, the pause screen appears]* Tripwire stops me. One question, one big safe button. And down here: "Checked on your device · nothing left your computer." That check was Gemini Nano, running on this laptop, through Firebase AI Logic. Nothing was sent anywhere.
*Click "Why did Tripwire stop me?" to show the reasons, then **Stop and stay safe**.*

**The urgency breaker (add about 15 seconds here, and trim the phone-call section to match).** *Screen: open `giftcard.html` and click into the code box. The pause shows the yellow box and "You can continue in 4:59".*
> Scams run on one thing: act now. So when someone is about to buy gift cards, send crypto or let a stranger into their computer, Tripwire holds "continue" for five minutes. Real emergencies can wait five minutes. Scams can't. *[pause]* And the first thing it says is: hang up.

**1:05–1:35. The hybrid part: the privacy gate.** *Screen: Wi-Fi back on, open `support.html` (fake tech support), let it pause or banner, click "See exactly what was sent".*
> When the computer isn't sure, Tripwire asks a stronger model in the cloud. But first, Gemini Nano on the device finds the names, numbers and addresses, and Tripwire removes them. *[pause]* This is exactly what was sent: no name, no card, no phone number. If anything personal were left, nothing would be sent at all. That's the idea: the small model is the privacy gate in front of the big one.

**1:35–2:00. The phone call.** *Screen: Tripwire icon → **Someone is on the phone with me**. Tap: **My bank**, then **Read them a code from my phone**, then **Check this call**.*
> Most of these scams start with a phone call, and no browser can hear a call. So the person just taps what the caller wants. *[pause]* A real bank never asks for that code, so the answer is instant: hang up now, and call back on a number you already know.
*Click **I hung up**.*

**2:00–2:15. The family.** *Screen: the family page in the other window, the new alert appearing.*
> And the family hears about it within seconds. The alert says what happened, never what was on the page. The security rules only allow fixed sentences, so a message's text can't leak, even by accident.

**2:15–2:30. Proof and close.** *Screen: README "At a glance" table, or a title card with the numbers.*
> On scams we never tuned on, the built-in rules alone catch three in twenty-eight. With Gemini Nano first, Tripwire catches all twenty-eight, with no false alarms on thirty-nine real pages, and it sends eighty-one percent less data than a cloud-only check. Tripwire. It steps in at the moment it matters, and keeps what's private, private.

Things not to say: don't claim the Android app was tested on a phone (it hasn't been), and don't claim users tested it.

## 3. Recording software

**Use OBS Studio** (free, best quality). Record the screen and your voice in OBS, then trim in **Clipchamp** (built into Windows) or **DaVinci Resolve** (free).

The quick alternative is **Win + Alt + R** (Xbox Game Bar). It records one window at your screen's resolution, with no setup, but has fewer audio options.

### OBS settings for the best quality

**Settings → Video**
- **Base (Canvas) Resolution:** your monitor's real resolution (for a 4K monitor, 3840x2160).
- **Output (Scaled) Resolution:**
  - **4K monitor:** 3840x2160.
  - **1080p monitor:** set the output to **2560x1440**. This doesn't add detail, but YouTube gives 1440p uploads a much higher bitrate, so text stays sharp. Recording a 1080p screen "at 4K" only makes the file bigger.
- **Common FPS:** 30 is enough for a screen demo; 60 if scrolling looks choppy.

**Settings → Output** (set Output Mode to **Advanced**, then the **Recording** tab)
- **Recording Format:** Fragmented MP4. A crash won't lose the file.
- **Video Encoder:**
  - **NVIDIA card:** NVENC HEVC, or NVENC H.264 if HEVC isn't listed.
  - **AMD card:** AMF H.264 or HEVC.
  - **Otherwise:** x264.
- **Rate Control:** CQP / CRF, set to **18** (lower is better quality and a bigger file; 16–20 is ideal for text).
- **Preset:** Quality, or P6/P7 on NVENC.
- **Audio bitrate:** 192 or higher.

**Sources** (the box at the bottom)
- Add **Display Capture** (your whole monitor) or **Window Capture** (Chrome only).
- Add **Audio Input Capture** for your mic. Remove desktop audio unless you want the click sounds.

**Mic filters** (right-click the mic in the Audio Mixer, choose **Filters**, and add them in this order)
1. **Noise Suppression**, set to **RNNoise**.
2. **Noise Gate**, default.
3. **Compressor**, ratio 4:1, threshold −18 dB.
4. **Limiter**, −1 dB.

Speak at your normal volume. The mixer bar should sit mostly in the yellow and never hit red.

**Before the real take**, record 20 seconds, play it back, and check two things: the text is sharp at full screen, and your voice is clear without echo.

**Tips:**
- Record each section of the script separately, then join them. Mistakes cost only one section.
- Record the voice for a section, then do the clicks while you listen back. Or do both together if you're comfortable.
- In Clipchamp, add a short title card at the start and a end card with the repo link.

## 4. Upload

1. **Export:** in Clipchamp, export at **1080p** (4K or 1440p if you recorded at that).
2. **Upload:** put it on YouTube as **Public**, with the title "Tripwire: stepping in at the moment of a scam (#BuildHybridAI)".
3. **Submit:** paste the link on Devpost.
4. **Final check:** open the link in a private window to confirm anyone can watch it.
