/**
 * Every word Tripwire shows a person, in one file, for easy review.
 *
 * Voice: short, plain, kind. Written for someone in their seventies who may be
 * frightened and rushed. No jargon ("phishing", "malware", "vector"), no blame,
 * no shouting. Say what is happening, then say what to do.
 */
import type { SignalCategory } from '../config/defaults';
import type { Route, ScamType, Trigger, ProtectionAction } from '../inference/schemas';

export const BRAND = {
  name: 'Tripwire',
  tagline: 'A calm second look before you act',
} as const;

/* ------------------------------------------------------------------ */
/* Route badges: what left this device, said honestly on every verdict */
/* ------------------------------------------------------------------ */

export type RouteTone = 'local' | 'redacted' | 'fallback' | 'rules';

export const ROUTE_BADGE: Record<Route, { tone: RouteTone; label: string; detail: string; long: string }> = {
  on_device: {
    tone: 'local',
    label: 'Checked on your device',
    detail: 'nothing left your computer',
    long: 'This check ran entirely on your computer. Nothing on this page was sent anywhere.',
  },
  device_then_cloud: {
    tone: 'redacted',
    label: 'Personal info removed',
    detail: 'sent for a deeper check',
    long: 'Your computer checked this first, then removed the names, numbers and addresses it found before asking for a second opinion.',
  },
  cloud_fallback: {
    tone: 'fallback',
    label: 'Checked online',
    detail: 'personal info removed first',
    long: 'This computer cannot run the private on-device check, so Tripwire removed the names, numbers and addresses it could recognize before checking online.',
  },
  rules_only: {
    tone: 'rules',
    label: 'Checked with built-in safety rules',
    detail: 'nothing left your computer',
    long: 'Tripwire could not reach its AI check just now, so it used its built-in list of warning signs. Nothing was sent anywhere.',
  },
  not_checked: {
    tone: 'local',
    label: 'Nothing to check here',
    detail: 'nothing left your computer',
    long: 'This page showed no warning signs, so Tripwire stayed out of the way.',
  },
};

/* ------------------------------------------------------------------ */
/* Caution banner                                                      */
/* ------------------------------------------------------------------ */

export const CAUTION_HEADLINE: Record<ScamType, string> = {
  none: 'Take a careful look at this page',
  tech_support: 'This looks like a fake computer warning',
  gift_card: 'Be careful: this message asks for gift cards',
  bank_impersonation: 'This may not really be from your bank',
  government_impersonation: 'This may not really be from the government',
  delivery: 'This delivery notice may not be real',
  shopping_impersonation: 'This may not really be from the store it names',
  investment_crypto: 'This money offer has warning signs',
  prize_lottery: 'This prize offer has warning signs',
  romance: 'This request for money has warning signs',
  payment_request: 'This request for payment has warning signs',
  phishing_login: 'This page may be trying to collect your password',
  other: 'Something about this page does not look right',
};

export const BANNER = {
  regionLabel: 'Tripwire notice',
  eyebrow: 'Warning from Tripwire',
  why: 'Why?',
  hide: 'Hide reasons',
  dismiss: 'Dismiss',
  dismissLabel: 'Dismiss this notice',
  sub: 'You do not have to do anything this page asks.',
  failSafeHeadline: 'Tripwire could not finish checking this page',
  failSafeSub: 'To be careful, treat anything it asks for as suspicious.',
  checkingCall: 'One moment. Tripwire is checking this page before the call starts.',
  checkingCard: 'One moment. Tripwire is checking this page before you type a card number.',
  checkingCode: 'One moment. Tripwire is checking this page before you type a code or an address.',
} as const;

/* ------------------------------------------------------------------ */
/* Tripped interstitial                                                */
/* ------------------------------------------------------------------ */

export const TRIP_LEAD: Record<Trigger, string> = {
  passive: 'This page shows strong signs of a scam.',
  card_entry: 'You are about to type a card number on a page that does not look safe.',
  remote_download: 'You are about to install a program that lets a stranger control this computer.',
  phone_call: 'This page is pushing you to call a phone number right away.',
  gift_card: 'This message asks you to pay with gift cards. Only scammers ask for that.',
  crypto_wire: 'This message asks you to send money in a way that cannot be undone.',
  live_call: 'A caller is asking for something scammers ask for.',
  money_transfer: 'You are about to move money out of your account.',
};

/** What decided a verdict, one plain line under "Why" (Verdict.decidedBy). */
export const DECIDED_BY = {
  label: 'What decided',
  gate: 'No warning signs, so no model was asked.',
  nothing_asked: 'The caller has not asked for anything yet.',
  rules: 'The built-in rules, because no model could answer.',
  cloud: 'The cloud model, after personal info was removed (no on-device model on this computer).',
  not_checked: 'Nothing: the check was not allowed to send anything off this computer.',
  wide_unsure: 'Gemini Nano looked and was not sure enough to warn.',
  wide_sure: 'Gemini Nano was sure, though the built-in lists found nothing.',
  device_safe: 'Gemini Nano found nothing worrying.',
  device_confirmed: 'Gemini Nano, confirmed by the built-in rules.',
  device_then_cloud: 'Gemini Nano was unsure, so the cloud model was asked; both had a say.',
  about_scams: 'This page is about scams, and Gemini Nano alone never warns on such a page.',
  rules_overruled: 'Gemini Nano said it looked fine, but the built-in rules found strong signs.',
  device_alone: 'Gemini Nano, with no second opinion available.',
};

/** The money-transfer pause: a real bank page at a risky moment (src/tripwires/transfer.ts). */
export const TRANSFER = {
  question: 'Is someone on the phone telling you to move money?',
  reassurance:
    'Your bank will never ask you to move money to keep it safe, and neither will the police or the government. Anyone who says so is a scammer, even if the call seems to come from your bank.',
  newPayee: 'You are sending money to someone you have not paid before.',
  recentWarning: 'Tripwire warned you about a possible scam on this computer within the last hour.',
  formSigns: 'The transfer form itself tells the story scammers use to make people move money.',
  explanation: 'Moving money to a new account, especially soon after a frightening call or message, is how the costliest scams end. Money sent this way usually cannot be brought back.',
};

export const GIFT_BUY = {
  lead: 'You are about to pay for gift cards.',
  question: 'Is someone on the phone telling you to buy these gift cards?',
  reassurance:
    'No real company, bank or government office is ever paid in gift cards. If someone on the phone asked you to buy them and read out the numbers, it is a scam: hang up.',
  reason: 'You are buying gift cards worth a lot of money. Scammers ask for them because the money cannot be traced or brought back.',
  explanation: 'Gift cards are how many phone scams get paid. Once the numbers on the back are read out, the money is gone.',
};

export const INTERSTITIAL = {
  dialogLabel: 'Tripwire paused this page',
  title: 'Let’s pause for a moment',
  question: 'Did someone call, text, or email you and ask you to do this?',
  reassurance:
    'Scammers rush people so there is no time to think. A real bank, store, or government office will always let you take your time.',
  primary: 'Stop and stay safe',
  secondary: 'I’m sure, continue',
  holdLead: 'Real emergencies can wait 5 minutes. Scams can’t.',
  holdHangUp: 'If someone is on the phone with you, hang up first.',
  holdCall: 'Then call the number on the back of your card, or on a bill you already have. Never a number they gave you.',
  holdWait: (time: string) => `You can continue in ${time}`,
  holdLonger: 'I’m still not sure: wait 5 more minutes',
  holdFamilyTold: 'Your family has been told. If they know this is really you, they can let it go through sooner.',
  holdFamilyReleased: 'Your family said this is fine. You can continue.',
  holdFamilyExtended: 'Your family asked you to wait until they have talked to you.',
  why: 'Why did Tripwire stop me?',
  hideWhy: 'Hide the reasons',
  continueNote: 'Only continue if you started this yourself and no one is hurrying you.',
  noticed: 'What Tripwire noticed',
} as const;

/* ------------------------------------------------------------------ */
/* "Why?" panel                                                        */
/* ------------------------------------------------------------------ */

export const WHY = {
  title: 'Why Tripwire stepped in',
  flagsLabel: 'What it noticed',
  routeLabel: 'How this was checked',
  close: 'Close',
  noFlags: 'Tripwire could not finish its check, so it is asking you to be careful.',
  redactions: (n: number) =>
    n === 1 ? '1 piece of personal info was removed first.' : `${n} pieces of personal info were removed first.`,
  cloudUnreachable: 'A deeper check was not possible because this computer is offline.',
  attemptedDetail: 'personal info removed, then it may have been sent',
  wrongSideDetail: 'a private check ran online by mistake, so Tripwire stopped',
  downloadingLabel: 'The private on-device check is still downloading',
  downloading: 'This computer can run the private on-device check, but it is still downloading. Until it is ready, Tripwire removes the names, numbers and addresses it can recognize before checking online.',
  wrongSide: 'Chrome reported that a check meant to run on this computer was answered online instead. Tripwire stopped at once, sent nothing more, and used its built-in warning signs. The text that check was given may have left your computer.',
  attempted: 'Tripwire tried a deeper check: it removed personal info and sent the rest, but no usable answer came back. "See exactly what was sent" shows what it sent.',
  sentShow: 'See exactly what was sent',
  sentHide: 'Hide what was sent',
  sentNote: 'This is everything Tripwire sent about this page. Personal details were replaced with tags like [NAME] first.',
  sentLabel: 'What was sent',
} as const;

/** One plain sentence per built-in warning sign. Used when no AI model could be reached. */
export const RULE_FLAG: Record<SignalCategory, string> = {
  giftCard: 'It asks for payment in gift cards. Real companies and agencies never do that.',
  remoteAccess: 'It wants you to install a program that lets someone else control your computer.',
  urgentCall: 'It pushes you to call a phone number right now.',
  cryptoWire: 'It asks for money by crypto or wire, which cannot be taken back.',
  credentialPressure: 'It asks you to confirm account or identity details.',
  paymentPressure: 'It asks for a payment or card number you were not expecting.',
  urgency: 'It tries to rush you with a deadline.',
  secrecy: 'It asks you to keep this secret or stay on the line.',
  impersonation: 'It claims to be from a well-known company or agency.',
  threat: 'It threatens that something bad will happen if you do not act.',
};

export const EXPLANATION = {
  rulesOnly: 'This page matches several warning signs that scams often share.',
  failSafe: 'Tripwire could not finish checking this page, so it is being careful.',
  localTrip: 'Your computer recognized this as a likely scam without sending anything anywhere.',
  localCaution: 'Your computer found some warning signs on this page.',
  steering: 'This page contains hidden instructions aimed at safety tools. Ordinary pages do not have those.',
  neverSafe: 'A real bank, government office or company does not ask for this on a call. Hang up and call back on a number you already know.',
} as const;

/* ------------------------------------------------------------------ */
/* "You stopped" page                                                  */
/* ------------------------------------------------------------------ */

export const SAFE_PAGE = {
  title: 'That was the right call',
  body: 'Nothing was sent and nothing was installed.',
  nextTitle: 'Here is what to do next.',
  steps: [
    {
      title: 'Hang up or stop replying',
      body: 'If someone is on the phone or messaging you, you can simply end it. You do not owe them an explanation.',
    },
    {
      title: 'Call the real number yourself',
      body: 'If you are worried about your bank or an account, use the number printed on your card or on a statement. Never use a number from the message.',
    },
    {
      title: 'Tell someone you trust',
      body: 'A second pair of eyes helps. Scammers count on people keeping it to themselves.',
    },
  ],
  close: 'Close this tab',
  guardianNote: 'Your family guardian has been told that you stopped. They were not sent any of your personal details.',
} as const;

/* ------------------------------------------------------------------ */
/* Onboarding (three screens)                                          */
/* ------------------------------------------------------------------ */

export const ONBOARDING = {
  stepLabel: (n: number, total: number) => `Step ${n} of ${total}`,
  next: 'Continue',
  back: 'Back',
  finish: 'Finish',
  skip: 'Skip for now',
  what: {
    title: 'Tripwire steps in at the moment it matters',
    body: 'Scams do not take your money when you read them. They take it when you act. Tripwire stays quiet until then.',
    moments: [
      'Typing a card number on a page that looks unsafe',
      'Being told to pay with gift cards',
      'Installing a program that lets a stranger into your computer',
      'Being pushed to call a number or send money right now',
    ],
    momentsLabel: 'It pauses you before:',
  },
  privacy: {
    title: 'Your emails never leave your device unless personal info is removed first',
    body: 'Tripwire reads pages on your own computer. If it wants a second opinion, it first removes names, phone numbers, emails, addresses, and card numbers, and only then asks.',
    modelTitle: 'Private checking on this computer',
    modelReady: 'Ready. Checks run on this computer.',
    modelDownloadable: 'This computer can run private checks. It needs a one-time download first.',
    modelDownloading: (pct: number) => `Downloading the private checker. ${pct}% done. You can keep going.`,
    modelUnavailable:
      'This computer cannot run private on-device checks. Tripwire will still protect you: it removes personal info before any online check.',
    modelButton: 'Get private checking ready',
    modelError: 'The download did not start. You can try again later from the Tripwire menu.',
    modelNotSetUp: 'Tripwire’s online setup is not finished, so it is using its built-in safety rules. Nothing leaves this computer.',
    readTitle: 'What your computer reads',
    sentTitle: 'The most that is ever sent',
    sampleNote: 'Sample message. The name and numbers are invented.',
  },
  family: {
    title: 'Would you like a family member to know if Tripwire steps in?',
    body: 'They will see that Tripwire stopped something and what kind of scam it looked like. They never see your emails, the pages you visit, or anything you type.',
    codeLabel: 'Your 8-digit pairing code',
    codeHelp: (url: string) => `Ask them to open ${url} and type this code. It works once, for 5 minutes.`,
    codeHelpNoUrl: 'Ask them to open the Tripwire family page and type this code. It works once, for 5 minutes.',
    getCode: 'Show a pairing code',
    newCode: 'Get a new code',
    paired: 'A family member is connected.',
    recentRisk: 'Tripwire warned about a possible scam on this computer in the last hour, so it will not show a code right now. If someone on the phone asked you to connect a family member, hang up. You can try again in an hour.',
    unavailable: 'Family alerts need an internet connection and a finished Tripwire setup. You can turn them on later from the Tripwire menu.',
    optional: 'You can skip this',
    connectedTitle: 'A family member is connected.',
    connectedBody: 'They will be told when Tripwire steps in. The code has been switched off and cannot be used again.',
    waiting: 'Waiting for them to type the code…',
    working: 'Getting a code…',
    approveTitle: 'Someone just typed your code',
    approveNamed: (name: string) => `${name} just typed your code`,
    approveBody: 'Allow them only if you gave this code to a family member yourself, just now. If you are not sure, choose No. If someone on the phone asked you for this code, hang up.',
    allow: 'Yes, allow',
    deny: 'No, this wasn’t them',
    refused: 'Removed. Nobody can see your alerts. You can show a new code at any time.',
  },
  done: {
    title: 'You are protected',
    body: 'You can close this tab. Tripwire will stay out of your way until something looks wrong.',
    demo: 'See a practice example',
    close: 'Close this tab',
    pin: 'Tip: if someone ever calls you about money, a computer problem or your bank, Tripwire can check the call with you. Pin it to your toolbar (click the puzzle-piece icon at the top right, then the pin next to Tripwire), then click it and choose "Someone is on the phone with me". You can also right-click any page, or press Alt+Shift+K.',
  },
} as const;

/** The invented message used to show redaction on the privacy screen. */
export const REDACTION_SAMPLE = {
  before: ['Dear ', { pii: 'Margaret Ellison' }, ', your card ', { pii: '4111 1111 1111 1111' }, ' was charged. Call ', { pii: '1-855-555-0119' }, '.'],
  after: ['Dear ', { tag: '[NAME]' }, ', your card ', { tag: '[CARD]' }, ' was charged. Call ', { tag: '[PHONE]' }, '.'],
} as const;

/* ------------------------------------------------------------------ */
/* Paused download page                                                */
/* ------------------------------------------------------------------ */

export const DOWNLOAD_PAUSE = {
  file: (name: string) => `The download “${name}” is paused, not installed.`,
  alwaysAsk: 'Tripwire always asks before a remote-access program is installed, because that is how many phone scams finish.',
  expiredTitle: 'Nothing is waiting here.',
  expiredBody: 'This download was already dealt with. You can close this tab.',
} as const;

/* ------------------------------------------------------------------ */
/* Toolbar popup                                                       */
/* ------------------------------------------------------------------ */

export const POPUP = {
  on: 'Tripwire is watching for scams',
  thisPage: 'This page',
  pageSafe: 'No warning signs found',
  pageCaution: 'Some warning signs found',
  pageTripped: 'Tripwire paused this page',
  pageUnknown: 'Tripwire does not check this kind of page',
  pageNotYet: 'Nothing on this page has needed a check yet',
  pageTrusted: 'You marked this site as trusted',
  trustedDetail: 'Tripwire is not checking it',
  settings: 'Settings',
  privateNotSetUp: 'Built-in rules only',
  privateChecks: 'Private checking',
  privateReady: 'On this computer',
  privateOff: 'Not on this computer',
  privatePending: 'Needs a one-time download',
  family: 'Family alerts',
  familyOn: 'On',
  familyOff: 'Off',
  setup: 'Open setup',
  practice: 'Try a practice example',
  diagnostics: 'Developer checks',
  callCheck: 'Someone is on the phone with me',
} as const;

/* ------------------------------------------------------------------ */
/* Check a phone call                                                  */
/* ------------------------------------------------------------------ */

export const CALL = {
  side: 'Is a caller asking you to do something?',
  sideBody: 'Most scams start with a phone call. Tell Tripwire what the caller wants, and it will give you a second opinion while you are still on the line.',
  title: 'What is the caller saying?',
  body: 'Tap what fits. You do not need to type anything.',
  ask: {
    who: {
      legend: 'Who do they say they are?',
      options: { bank: 'My bank', government: 'The government, Social Security or Medicare', company: 'A company like Amazon or Microsoft', family: 'Family or a friend in trouble', other: 'I don’t know' },
    },
    want: {
      legend: 'What do they want you to do?',
      hint: 'Tap all that fit.',
      options: { money: 'Pay a bill, a fine or a fee', safe_account: 'Move my money to a “safe” account', gift_cards: 'Buy gift cards', crypto: 'Send crypto or use a Bitcoin machine', code: 'Read them a code from my phone', details: 'Give my Social Security, Medicare or bank details', computer: 'Let them into my computer', nothing: 'Nothing yet' },
    },
    how: {
      legend: 'How are they acting?',
      hint: 'Tap all that fit.',
      options: { rushing: 'Rushing me or threatening', secret: 'Telling me to keep it secret', stay_on_line: 'Telling me to stay on the line', patient: 'Calm, and said I can call back' },
    },
    needOne: 'Tap at least one thing they want you to do.',
  },
  label: 'Anything else they said? (You can skip this.)',
  placeholder: 'For example: He says he is from my bank and my account is frozen. He wants me to read him the code they just texted me.',
  privacy: 'This is checked on your computer when it can. If it cannot, names and numbers are removed before an online check, and you can see exactly what was sent.',
  check: 'Check this call',
  checking: 'Checking…',
  failed: 'Tripwire could not check this just now. To be safe, hang up and call back on a number you already know.',
  hangUpAnytime: 'You can always hang up. A real bank, government office or company will understand and will still be there when you call back.',
  result: {
    tripped: { title: 'Hang up now', body: 'This sounds like a scam. A real bank, government office or company does not ask for this on a call.' },
    caution: { title: 'Be careful', body: 'Some of this sounds like what scammers say. It is fine to hang up.' },
    safe: { title: 'Nothing here sounds like a scam', body: 'If you are still unsure, it is always fine to hang up.' },
  },
  nothingYet: 'So far they have not asked for anything risky. If they ask for money, gift cards, a code from your phone or your personal details, hang up.',
  callBack: 'Call back on a number you already know: the one on your card, your bill, or the official website. Never the number the caller gives you.',
  hungUp: 'I hung up',
  addingReasons: 'Tripwire is adding the reasons…',
  again: 'Check another call',
  close: 'Close this tab',
  doneTitle: 'Well done',
  doneBody: 'Hanging up was the right thing to do. If you gave out any details, call your bank on the number on your card.',
} as const;

/* ------------------------------------------------------------------ */
/* Settings page                                                       */
/* ------------------------------------------------------------------ */

export const SETTINGS = {
  pageTitle: 'Settings',
  side: 'These choices stay on this computer',
  saved: 'Saved.',
  careful: {
    title: 'How careful should Tripwire be?',
    sliderLabel: 'Warning level',
    levels: {
      fewer: { name: 'Fewer warnings', body: 'Tripwire only speaks up when it is very sure. Choose this if it interrupts you too often.' },
      standard: { name: 'Standard', body: 'The balance Tripwire was tested with. Right for most people.' },
      more: { name: 'More careful', body: 'Tripwire speaks up sooner, even when it is less sure. Choose this if you have been targeted before.' },
    },
  },
  trusted: {
    title: 'Sites you trust',
    body: 'Tripwire never checks or interrupts these sites. Add a site only if you chose it yourself.',
    warning: 'Never add a site because someone on the phone or in a message told you to. That is how scammers switch protection off.',
    inputLabel: 'Site name',
    placeholder: 'For example: mybank.com',
    add: 'Add site',
    remove: 'Remove',
    removeLabel: (site: string) => `Remove ${site}`,
    empty: 'No trusted sites yet. Tripwire is checking everywhere.',
    invalid: 'That does not look like a site name. Try something like mybank.com.',
    duplicate: 'That site is already on the list.',
    added: (site: string) => `${site} added.`,
    removed: (site: string) => `${site} removed.`,
  },
  language: {
    title: 'Explanations in your language',
    toggle: (name: string) => `Explain warnings in ${name}`,
    body: 'When Tripwire steps in, the reasons are written in your browser’s language. On-device checks are translated on this computer; nothing extra is sent.',
    english: 'Your browser is set to English, so explanations are already in your language.',
  },
  family: {
    title: 'Family alerts',
    none: 'No family member is connected.',
    count: (n: number) => (n === 1 ? '1 family member is connected.' : `${n} family members are connected.`),
    body: 'They see that Tripwire stepped in and what kind of scam it looked like. Never your emails, the pages you visit, or anything you type.',
    disconnect: 'Disconnect everyone',
    confirm: 'Yes, disconnect everyone',
    cancel: 'Keep them connected',
    done: 'Disconnected. Nobody is being sent alerts now.',
    failed: 'That did not work. Check your internet connection and try again.',
    recentRisk: 'Tripwire warned you less than an hour ago, so your family stays connected for now. If someone on the phone told you to do this, hang up and call your family.',
    add: 'Connect a family member',
  },
  back: 'Close this tab',
} as const;

/* ------------------------------------------------------------------ */
/* Family Guardian: alert wording (deterministic, never model free text) */
/* ------------------------------------------------------------------ */

export const SCAM_TYPE_LABEL: Record<ScamType, string> = {
  none: 'Suspicious page',
  tech_support: 'Fake tech support',
  gift_card: 'Gift card demand',
  bank_impersonation: 'Fake bank message',
  government_impersonation: 'Fake government message',
  delivery: 'Fake delivery notice',
  shopping_impersonation: 'Fake store message',
  investment_crypto: 'Investment or crypto offer',
  prize_lottery: 'Fake prize',
  romance: 'Request for money',
  payment_request: 'Unexpected payment request',
  phishing_login: 'Fake sign-in page',
  other: 'Suspicious page',
};

/**
 * The one-sentence summary stored with a Guardian alert. Built only from the
 * scam type, so it is impossible for page or email content to end up in it.
 */
export const ALERT_SUMMARY: Record<ScamType, string> = {
  none: 'Tripwire saw several warning signs of a scam.',
  tech_support: 'A page claimed the computer had a problem and pushed for a call or remote access.',
  gift_card: 'A message asked for payment in gift cards.',
  bank_impersonation: 'A message posing as a bank asked for account or card details.',
  government_impersonation: 'A message posing as a government office demanded money or personal details.',
  delivery: 'A delivery notice asked for a fee or card details to release a package.',
  shopping_impersonation: 'A message posing as a store asked for account or payment details.',
  investment_crypto: 'An offer promised returns and asked for money by crypto or wire.',
  prize_lottery: 'A prize notice asked for a fee or personal details to collect winnings.',
  romance: 'Someone asked for money to be sent in a way that cannot be undone.',
  payment_request: 'A page asked for an unexpected payment or card number.',
  phishing_login: 'A page that looked like a sign-in screen asked for a password.',
  other: 'Tripwire saw several warning signs of a scam.',
};

/** The same sentences, for showing on the family page in the reader's language. Never stored. */
export const ALERT_SUMMARY_SHOWN: Record<ScamType, string> = { ...ALERT_SUMMARY };

export const TRIGGER_LABEL: Record<Trigger, string> = {
  passive: 'Opened a suspicious page',
  card_entry: 'Started typing a card number',
  remote_download: 'Started downloading a remote-access program',
  phone_call: 'Was urged to call a number',
  gift_card: 'Was asked to pay with gift cards',
  crypto_wire: 'Was asked to send crypto or a wire',
  live_call: 'Checked a phone call that asked for money or details',
  money_transfer: 'Started sending money from their bank',
};

/**
 * Alerts about a step that is not a scam type, stored with the fixed sentence for that step
 * (firestore.rules pins each one). Never derived from page content.
 */
export const ACTION_ALERT_SUMMARY: Record<'money_transfer' | ProtectionAction, string> = {
  money_transfer: 'A bank transfer was paused because it went to someone new or came soon after a scam warning.',
  trusted_site: 'A website was added to the list that Tripwire never checks.',
  setting_lowered: 'Tripwire was set to warn less often.',
};
export const ACTION_TITLE: Record<'money_transfer' | ProtectionAction, string> = {
  money_transfer: 'Money transfer paused',
  trusted_site: 'Protection turned down',
  setting_lowered: 'Protection turned down',
};
export const PROTECTION_LABEL: Record<ProtectionAction, string> = {
  trusted_site: 'Marked a website as trusted',
  setting_lowered: 'Turned the warning level down',
};

export const OUTCOME_LABEL = {
  stopped: 'Stopped',
  continued: 'Continued anyway',
  changed: 'Changed a setting',
} as const;
export type Outcome = keyof typeof OUTCOME_LABEL;

/* ------------------------------------------------------------------ */
/* Family dashboard (web app)                                          */
/* ------------------------------------------------------------------ */

export const DASHBOARD = {
  title: 'Tripwire family page',
  signIn: {
    title: 'Look out for someone, without looking over their shoulder',
    body: 'When Tripwire steps in on their computer, you will see that it happened and what kind of scam it looked like. You never see their emails, the pages they visit, or anything they type.',
    google: 'Continue with Google',
    guest: 'Continue without an account',
    guestNote: 'Without an account, this page only remembers you on this browser.',
    error: 'Sign-in did not work. Please try again.',
  },
  pair: {
    title: 'Connect to their Tripwire',
    body: 'Ask them to open Tripwire and choose “Show a pairing code”. Type the eight digits here.',
    codeLabel: 'Eight-digit pairing code',
    nameLabel: 'What should we call them?',
    namePlaceholder: 'For example: Mom',
    meLabel: 'Your first name',
    mePlaceholder: 'For example: Sam',
    meHelp: 'They see it before they let you in, so they know it is really you.',
    submit: 'Connect',
    working: 'Connecting…',
    errorNotFound: 'That code was not found or has run out. Ask them for a new one.',
    errorGeneric: 'Could not connect just now. Check your internet and try again.',
    errorBlocked:
      'This browser could not be confirmed as a real visitor, so the connection was refused. Turn off any ad blocker or private window for this page, or try another browser.',
    errorFormat: 'The code is eight digits.',
  },
  feed: {
    title: 'Recent alerts',
    emptyTitle: 'All quiet',
    emptyBody: 'When Tripwire steps in, it will appear here within a few seconds.',
    live: 'Updating live',
    stopped: 'They stopped',
    continued: 'They continued anyway',
    continuedAdvice: 'It may be worth a friendly call today.',
    stoppedAdvice: 'No action needed, though they may appreciate hearing from you.',
    changed: 'Their protection changed',
    changedAdvice: 'If they did not mean to, or someone on the phone told them to, give them a call.',
    lastSeen: (when: string) => `Tripwire last checked in from their computer ${when}`,
    holdTitle: 'Tripwire is holding something right now',
    holdBody: (what: string, time: string) => `${what}. Tripwire is asking them to wait until ${time}.`,
    holdAdvice: 'Call them. If no stranger is on the phone with them and this is really their own idea, you can let it go through.',
    holdRelease: 'I talked to them: let it go through',
    holdExtend: 'Keep it on hold for 30 minutes',
    holdReleased: 'You let it go through',
    holdExtended: 'You asked them to wait 30 more minutes',
    disconnected: (name: string) =>
      `${name}'s computer has disconnected this page, so you will not get alerts from it. If you did not expect that, call them: scammers sometimes tell people to cut their family off.`,
    holdNewFamily: 'You connected less than a day ago, so you can keep this on hold but not let it go through yet. That way a stranger who talked them into connecting cannot release it.',
    holdFailed: 'That did not go through. Family connected in the last day can keep a hold but not let it go through; otherwise check your internet and try again.',
    quiet: (when: string) =>
      `Tripwire has not checked in from their computer since ${when}. The computer may just be off, or Tripwire may have been removed. A quick call can tell.`,
    addAnother: 'Connect another person',
    signOut: 'Sign out',
    privacyTitle: 'What you can and cannot see',
    privacyBody:
      'Alerts contain the time, the kind of scam, what they were about to do, and whether they stopped. Tripwire never stores the page, the email, or anything they typed.',
    loadError: 'Alerts could not be loaded. Check your internet connection.',
    waitingApproval: 'Connected. Waiting for them to tap “Yes, allow” on their computer…',
    subtitle: 'Recent alerts from their Tripwire',
    loading: 'Loading…',
    today: 'Today',
    yesterday: 'Yesterday',
    someone: 'Someone you look out for',
  },
  see: {
    yes: 'You will see',
    yesItems: ['When Tripwire stepped in', 'What kind of scam it looked like', 'What they were about to do, and whether they stopped'],
    no: 'You will never see',
    noItems: ['Their emails or messages', 'The pages they visit', 'Anything they type'],
  },
  notSetUp: {
    title: 'This family page is not connected yet',
    body: 'Whoever set up this copy of Tripwire needs to add its Firebase settings. The steps are in the project README.',
  },
} as const;

/* ------------------------------------------------------------------ */
/* Developer checks page (for judges and contributors, not for seniors) */
/* ------------------------------------------------------------------ */

export const CHECKS = {
  title: 'Developer checks',
  intro: 'Live calls through Firebase AI Logic, from this extension page. Nothing here runs unless you press a button.',
  status: 'Status',
  refresh: 'Refresh status',
  prepare: 'Download the on-device model',
  probe: 'Hybrid call (prefer on-device)',
  probeNote: 'One Firebase AI Logic call in PREFER_ON_DEVICE mode. Reports which side answered.',
  sample: 'Check a piece of text',
  sampleNote: 'Runs the full router: on-device triage, redaction, then the cloud only if needed.',
  run: 'Check this text',
  language: 'Explain in (language code, for example es)',
  corpus: 'Run the test corpus',
  corpusNote: '25 scam and 25 ordinary messages through the live router. The target is zero false alarms.',
  runCorpus: 'Run all 50',
  save: 'Save results as JSON',
  working: 'Working…',
  sampleText:
    'URGENT: Your bank account has been locked. Call 1-855-555-0119 immediately and confirm your card number 4111 1111 1111 1111 or your account will be closed today. Do not tell anyone at the branch.',
} as const;

/* ------------------------------------------------------------------ */
/* The page Chrome opens after Tripwire is removed                     */
/* ------------------------------------------------------------------ */

export const REMOVED = {
  side: 'Tripwire is no longer on this computer',
  title: 'Tripwire was removed',
  body: 'It will no longer pause scams on this computer, and family alerts have stopped.',
  callerLead: 'Did someone on the phone tell you to remove it?',
  callerBody: 'Then that call is a scam. Hang up now. Call your bank using the number on the back of your card, and tell someone you trust.',
  putBack: 'If you removed it by mistake, ask the person who set it up to put it back.',
};
