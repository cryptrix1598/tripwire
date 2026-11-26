// The built-in rules alone, as a baseline: reads one JSON string per line on stdin
// (a page or message text) and writes one verdict per line on stdout. Used by
// `node scripts/holdout.mjs --rules` so the held-out set has a no-AI comparison.
// Nothing is stored.
import { createInterface } from 'node:readline';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { AiEngine } from '../src/inference/engine';
import { assess } from '../src/inference/router';

const noModel: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: async () => {
    throw new Error('no model');
  },
  redactOnDevice: async () => {
    throw new Error('no model');
  },
  analyzeInCloud: async () => {
    throw new TypeError('Failed to fetch');
  },
};

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  const text = JSON.parse(line) as string;
  const v = await assess({ text, hostname: 'holdout.example', trigger: 'passive' }, { engine: noModel, config: DEFAULT_CONFIG });
  process.stdout.write(`${JSON.stringify({ state: v.state, riskScore: v.riskScore, route: v.route, bytesSentToCloud: v.bytesSentToCloud, elapsedMs: v.elapsedMs })}\n`);
}
