/**
 * Corpus evaluation, Node edition.
 *
 *   npm run eval            rules-only baseline (no AI, nothing leaves the machine)
 *   npm run eval -- --json  also print the full JSON summary
 *
 * Node has no Gemini Nano and this script deliberately holds no credentials, so
 * it measures the DETERMINISTIC layer only: the signal gate and the rules-only
 * fallback verdict, i.e. what Tripwire does when no model can be reached.
 *
 * The real hybrid numbers (on-device + cloud through Firebase AI Logic) come
 * from the same corpus and the same scoring code, run inside the extension:
 * open the Tripwire menu → Developer checks → "Run the test corpus".
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SAMPLES } from '../corpus/index';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { AiEngine } from '../src/inference/engine';
import { runEval } from '../src/inference/evalCore';

/** An engine with no models at all: forces the rules-only route. */
const noModelEngine: AiEngine = {
  onDeviceStatus: async () => 'unavailable',
  triageOnDevice: async () => {
    throw new Error('no on-device model in Node');
  },
  redactOnDevice: async () => {
    throw new Error('no on-device model in Node');
  },
  analyzeInCloud: async () => {
    throw new Error('offline: the Node eval never calls the cloud');
  },
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const summary = await runEval(ALL_SAMPLES, noModelEngine, DEFAULT_CONFIG, 'rules-only baseline (Node, no AI)');

console.log('\nTripwire corpus evaluation — rules-only baseline (no AI)\n');
console.log('id'.padEnd(38), 'label'.padEnd(7), 'state'.padEnd(8), 'score'.padEnd(6), 'route'.padEnd(12), 'ok');
console.log('-'.repeat(80));
for (const r of summary.rows) {
  console.log(
    r.id.padEnd(38),
    r.label.padEnd(7),
    r.state.padEnd(8),
    String(r.riskScore).padEnd(6),
    r.route.padEnd(12),
    r.correct ? 'yes' : 'NO',
  );
}
console.log('-'.repeat(80));
console.log(`Scams flagged (caution or tripped): ${summary.detected}/${summary.scams}  (${pct(summary.detectionRate)})`);
console.log(`  of which tripped:                 ${summary.tripped}/${summary.scams}`);
console.log(`False positives on benign set:      ${summary.falsePositives}/${summary.benign}  (${pct(summary.falsePositiveRate)})`);
console.log(`Bytes sent to any cloud model:      ${summary.totalBytesSentToCloud}`);

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'eval-results', 'rules-baseline.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nSaved ${outPath}`);
if (process.argv.includes('--json')) console.log(JSON.stringify(summary, null, 2));

// A false positive in the demo is fatal, so it is fatal here too.
if (summary.falsePositives > 0) {
  console.error('\nFAIL: the benign set must produce zero false positives.');
  process.exit(1);
}
