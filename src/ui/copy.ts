/**
 * Every word Tripwire shows a person, in one file, for easy review.
 *
 * Voice: short, plain, kind. Written for someone in their seventies who may be
 * frightened and rushed. No jargon ("phishing", "malware", "vector"), no blame,
 * no shouting. Say what is happening, then say what to do.
 */
import type { SignalCategory } from '../config/defaults';
import type { Route, ScamType, Trigger } from '../inference/schemas';

export const BRAND = {
  name: 'Tripwire',
  tagline: 'A calm second look before you act.',
} as const;

/* ------------------------------------------------------------------ */
/* Route badges: what left this device, said honestly on every verdict */
/* ------------------------------------------------------------------ */

export type RouteTone = 'local' | 'redacted' | 'fallback' | 'rules';

export const ROUTE_BADGE: Record<Route, { tone: RouteTone; label: string; detail: string; long: string }> = {
  on_device: {
    tone: 'local',
    label: 'Checked on your device',
    detail: '0 bytes sent',
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
    label: "Your device doesn't support on-device AI",
    detail: 'personal info removed before checking',
    long: 'This computer cannot run the private on-device check, so Tripwire removed the names, numbers and addresses it could recognise before checking online.',
  },
  rules_only: {
    tone: 'rules',
    label: 'Checked with built-in safety rules',
    detail: '0 bytes sent',
    long: 'Tripwire could not reach its AI check just now, so it used its built-in list of warning signs. Nothing was sent anywhere.',
  },
  not_checked: {
    tone: 'local',
    label: 'Nothing to check here',
    detail: '0 bytes sent',
    long: 'This page showed no warning signs, so Tripwire stayed out of the way.',
  },
};

/* ------------------------------------------------------------------ */
/* Caution banner                                                      */
/* ------------------------------------------------------------------ */

export const CAUTION_HEADLINE: Record<ScamType, string> = {
  none: 'Take a careful look at this page.',
  tech_support: 'This looks like a fake computer warning.',
  gift_card: 'This message asks for gift cards. Be careful.',
  bank_impersonation: 'This may not really be from your bank.',
  government_impersonation: 'This may not really be from the government.',
  delivery: 'This delivery notice may not be real.',
  shopping_impersonation: 'This may not really be from the store it names.',
  investment_crypto: 'This money offer has warning signs.',
  prize_lottery: 'This prize offer has warning signs.',
  romance: 'This request for money has warning signs.',
  payment_request: 'This request for payment has warning signs.',
  phishing_login: 'This page may be trying to collect your password.',
  other: 'Something about this page does not look right.',
};

export const BANNER = {
  regionLabel: 'Tripwire notice',
  why: 'Why?',
  hide: 'Hide reasons',
  dismiss: 'Dismiss',
  dismissLabel: 'Dismiss this notice',
  sub: 'You do not have to do anything this page asks.',
  failSafeHeadline: 'Tripwire could not finish checking this page.',
  failSafeSub: 'To be careful, treat anything it asks for as suspicious.',
  checkingCall: 'One moment. Tripwire is checking this page before the call starts.',
  checkingCard: 'One moment. Tripwire is checking this page before you type a card number.',
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
};

export const INTERSTITIAL = {
  dialogLabel: 'Tripwire paused this page',
  title: 'Let’s pause for a moment.',
  question: 'Did someone call, text, or email you and ask you to do this?',
  reassurance:
    'Scammers rush people so there is no time to think. A real bank, store, or government office will always let you take your time.',
  primary: 'Stop and stay safe',
  secondary: 'I’m sure, continue',
  why: 'Why did Tripwire stop me?',
  hideWhy: 'Hide the reasons',
  continueNote: 'Only continue if you started this yourself and no one is hurrying you.',
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
  localTrip: 'Your computer recognised this as a likely scam without sending anything anywhere.',
  localCaution: 'Your computer found some warning signs on this page.',
  steering: 'This page contains hidden instructions aimed at safety tools. Ordinary pages do not have those.',
} as const;

/* ------------------------------------------------------------------ */
/* "You stopped" page                                                  */
/* ------------------------------------------------------------------ */

export const SAFE_PAGE = {
  title: 'That was the right call.',
  body: 'Nothing was sent and nothing was installed.',
  nextTitle: 'Here is what to do next.',
  steps: [
    {
      title: 'Hang up or stop replying.',
      body: 'If someone is on the phone or messaging you, you can simply end it. You do not owe them an explanation.',
    },
    {
      title: 'Call the real number yourself.',
      body: 'If you are worried about your bank or an account, use the number printed on your card or on a statement. Never use a number from the message.',
    },
    {
      title: 'Tell someone you trust.',
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
    title: 'Tripwire steps in at the moment it matters.',
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
    title: 'Your emails never leave your device unless personal info is removed first.',
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
    codeLabel: 'Your pairing code',
    codeHelp: (url: string) => `Ask them to open ${url} and type this code. It works once, for 5 minutes.`,
    codeHelpNoUrl: 'Ask them to open the Tripwire family page and type this code. It works once, for 5 minutes.',
    getCode: 'Show a pairing code',
    newCode: 'Get a new code',
    paired: 'A family member is connected.',
    unavailable: 'Family alerts need an internet connection and a finished Tripwire setup. You can turn them on later from the Tripwire menu.',
    optional: 'You can skip this',
    connectedTitle: 'A family member is connected.',
    connectedBody: 'They will be told when Tripwire steps in. The code has been switched off and cannot be used again.',
    waiting: 'Waiting for them to type the code…',
    working: 'Getting a code…',
  },
  done: {
    title: 'You are protected.',
    body: 'You can close this tab. Tripwire will stay out of your way until something looks wrong.',
    demo: 'See a practice example',
    close: 'Close this tab',
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
  on: 'Tripwire is watching for scams.',
  thisPage: 'This page',
  pageSafe: 'No warning signs found.',
  pageCaution: 'Some warning signs found.',
  pageTripped: 'Tripwire paused this page.',
  pageUnknown: 'Tripwire does not check this kind of page.',
  pageNotYet: 'Nothing on this page has needed a check yet.',
  pageTrusted: 'You marked this site as trusted.',
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
} as const;

/* ------------------------------------------------------------------ */
/* Settings page                                                       */
/* ------------------------------------------------------------------ */

export const SETTINGS = {
  pageTitle: 'Settings',
  side: 'These choices stay on this computer.',
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
  none: 'A page showed several warning signs of a scam.',
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
  other: 'A page showed several warning signs of a scam.',
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
};

export const OUTCOME_LABEL = {
  stopped: 'Stopped',
  continued: 'Continued anyway',
} as const;
export type Outcome = keyof typeof OUTCOME_LABEL;

/* ------------------------------------------------------------------ */
/* Family dashboard (web app)                                          */
/* ------------------------------------------------------------------ */

export const DASHBOARD = {
  title: 'Tripwire family page',
  signIn: {
    title: 'Look out for someone, without looking over their shoulder.',
    body: 'When Tripwire steps in on their computer, you will see that it happened and what kind of scam it looked like. You never see their emails, the pages they visit, or anything they type.',
    google: 'Continue with Google',
    guest: 'Continue without an account',
    guestNote: 'Without an account, this page only remembers you on this browser.',
    error: 'Sign-in did not work. Please try again.',
  },
  pair: {
    title: 'Connect to their Tripwire',
    body: 'Ask them to open Tripwire and choose “Show a pairing code”. Type the six digits here.',
    codeLabel: 'Six-digit pairing code',
    nameLabel: 'What should we call them?',
    namePlaceholder: 'For example: Mum',
    submit: 'Connect',
    working: 'Connecting…',
    errorNotFound: 'That code was not found or has run out. Ask them for a new one.',
    errorGeneric: 'Could not connect just now. Check your internet and try again.',
    errorBlocked:
      'This browser could not be confirmed as a real visitor, so the connection was refused. Turn off any ad blocker or private window for this page, or try another browser.',
    errorFormat: 'The code is six digits.',
  },
  feed: {
    title: 'Recent alerts',
    emptyTitle: 'All quiet.',
    emptyBody: 'When Tripwire steps in, it will appear here within a few seconds.',
    live: 'Updating live',
    stopped: 'They stopped',
    continued: 'They continued anyway',
    continuedAdvice: 'It may be worth a friendly call today.',
    stoppedAdvice: 'No action needed, though they may appreciate hearing from you.',
    addAnother: 'Connect another person',
    signOut: 'Sign out',
    privacyTitle: 'What you can and cannot see',
    privacyBody:
      'Alerts contain the time, the kind of scam, what they were about to do, and whether they stopped. Tripwire never stores the page, the email, or anything they typed.',
    loadError: 'Alerts could not be loaded. Check your internet connection.',
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
    title: 'This family page is not connected yet.',
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
