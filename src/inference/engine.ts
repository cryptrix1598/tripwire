/**
 * The seam between the router and Firebase AI Logic.
 *
 * The router only knows this interface. The real implementation
 * (`firebaseEngine.ts`) is the single place in the codebase that performs AI
 * inference, and it does so only through Firebase AI Logic. Tests and the
 * offline eval script plug in fakes here.
 */

/** Mirrors the Chrome Prompt API availability states. */
export type OnDeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface AiEngine {
  /** Whether Gemini Nano can run on this device right now. */
  onDeviceStatus(): Promise<OnDeviceStatus>;
  /** [1] On-device triage. Must never leave the device. Resolves to raw JSON text. */
  triageOnDevice(systemPrompt: string, userPrompt: string): Promise<string>;
  /** [2] On-device redaction. Must never leave the device. Resolves to raw JSON text. */
  redactOnDevice(systemPrompt: string, userPrompt: string): Promise<string>;
  /** [3] Cloud analysis. Only ever called with redacted text. Resolves to raw JSON text. */
  analyzeInCloud(systemPrompt: string, userPrompt: string, model: string): Promise<string>;
}

/** Thrown by an engine when a call that had to stay on-device did not. */
export class PrivacyInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivacyInvariantError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
