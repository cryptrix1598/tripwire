/** How long each model call may take. Shared by the router and the content script. */
export const DEFAULT_TIMEOUTS = { onDeviceMs: 15_000, cloudMs: 20_000 };

/**
 * The longest a single check can take with the default timeouts: on-device triage, on-device
 * redaction, the cloud call and an on-device translation, one after another. A timed-out call is
 * not retried, so this is the bound. Anything held while a check runs is held at least this long.
 */
export const MAX_CHECK_MS = DEFAULT_TIMEOUTS.onDeviceMs * 3 + DEFAULT_TIMEOUTS.cloudMs;
