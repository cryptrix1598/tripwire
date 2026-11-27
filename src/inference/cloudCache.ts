/**
 * Keeps the cloud path working when many people use it on a free quota.
 *
 * - The same redacted request is never sent twice in half an hour: the answer is remembered,
 *   in memory only (never in storage), keyed by a SHA-256 of the request. Rescans of the same
 *   page, the same email opened twice, or the same scam text on many tabs cost one call.
 * - After the cloud says "over quota", it is left alone for a minute, so pages are decided at once
 *   by the built-in rules (with the fail-safe bar) instead of each waiting for a call that will fail.
 *
 * Because the offscreen document runs one check at a time, two identical checks in a row are
 * deduplicated too: the second finds the first's answer here.
 */
import type { CloudAnalysis } from './schemas';

export interface CloudCache {
  get(request: string): Promise<CloudAnalysis | undefined>;
  set(request: string, analysis: CloudAnalysis): Promise<void>;
  /** The cloud reported it is over quota. */
  overQuota(): void;
  /** Still inside the quiet minute after an "over quota" answer. */
  resting(): boolean;
}

export const CACHE_MS = 30 * 60_000;
export const QUOTA_REST_MS = 60_000;
const MAX_ENTRIES = 200;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createCloudCache(now: () => number = Date.now): CloudCache {
  const entries = new Map<string, { at: number; analysis: CloudAnalysis }>();
  let restUntil = 0;
  return {
    async get(request) {
      const key = await sha256(request);
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > CACHE_MS) {
        entries.delete(key);
        return undefined;
      }
      return hit.analysis;
    },
    async set(request, analysis) {
      const key = await sha256(request);
      entries.delete(key);
      entries.set(key, { at: now(), analysis });
      // Oldest first out.
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
    },
    overQuota() {
      restUntil = now() + QUOTA_REST_MS;
    },
    resting() {
      return now() < restUntil;
    },
  };
}
