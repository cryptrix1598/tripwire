// Held-out evaluation with the on-device model:
//   node scripts/holdout.mjs
// Ten scam messages never used for tuning, plus real public pages fetched live
// (the hardest ordinary pages we could think of: official advice ABOUT scams,
// remote-access vendors, gift card and crypto explainers, news). Page text is
// read the way the extension reads it (visible text) and is not stored.
// Results, with latency, are saved to eval-results/holdout/.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const set = JSON.parse(readFileSync('corpus/holdout.json', 'utf8'));
const bundle = readFileSync('node_modules/playwright-core/lib/coreBundle.js', 'utf8');
const disabled = (/disabledFeatures = \[([\s\S]*?)\];/.exec(bundle)?.[1] ?? '').split('\n').map((l) => /^\s*"([^"]+)"/.exec(l)?.[1]).filter(Boolean);

const server = await createServer({ configFile: resolve('dashboard/vite.config.ts'), logLevel: 'error', server: { hmr: false, watch: null } });
await server.listen();
// --rules: the same held-out set judged by the built-in rules alone (no model), as a baseline.
const rulesOnly = process.argv.includes('--rules');
const rulesChild = rulesOnly ? spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'scripts/rules-verdict.ts'], { stdio: ['pipe', 'pipe', 'inherit'], shell: process.platform === 'win32' }) : null;
const rulesAnswers = rulesChild ? createInterface({ input: rulesChild.stdout })[Symbol.asyncIterator]() : null;
const rulesCheck = async (text) => {
  rulesChild.stdin.write(`${JSON.stringify(text)}\n`);
  return JSON.parse((await rulesAnswers.next()).value);
};
const context = await chromium.launchPersistentContext(resolve('.nano-profile'), {
  channel: 'chrome',
  headless: true,
  ignoreDefaultArgs: ['--disable-background-networking', '--disable-component-update', `--disable-features=${disabled.join(',')}`],
  args: [`--disable-features=${disabled.filter((f) => f !== 'OptimizationHints').join(',')}`, '--enable-features=AIPromptAPI,AIPromptAPIMultimodalInput,OptimizationGuideOnDeviceModel'],
});

const rows = [];
const skipped = [];
const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

try {
  const harness = context.pages()[0] ?? (await context.newPage());
  await harness.goto('http://localhost:5174/preview.html?page=checks');
  const section = harness.locator('section.tw-card', { has: harness.locator('#sample') });
  const check = rulesOnly ? rulesCheck : async (text) => {
    await harness.locator('#sample').fill(text);
    await harness.getByRole('button', { name: 'Check this text' }).click();
    await harness.waitForTimeout(300);
    await harness.getByRole('button', { name: 'Check this text' }).waitFor({ timeout: 180_000 });
    return JSON.parse(await section.locator('pre').innerText());
  };
  const record = (id, label, chars, v) => {
    rows.push({ id, label, chars, state: v.state, riskScore: v.riskScore, route: v.route, bytesSentToCloud: v.bytesSentToCloud, elapsedMs: v.elapsedMs, correct: label === 'scam' ? v.state !== 'safe' : v.state === 'safe' });
    console.log(`  ${label.padEnd(6)} ${v.state.padEnd(8)} ${String(v.riskScore).padStart(3)}  ${v.route.padEnd(18)} ${String(v.elapsedMs).padStart(6)}ms  ${id}`);
  };

  const model = await harness.evaluate(async () => (typeof LanguageModel === 'undefined' ? 'no LanguageModel API' : await LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] })));
  console.log(`Chrome ${context.browser()?.version() ?? ''} | on-device model: ${model}\n`);

  const onlyRound3 = process.argv.includes('--round3');
  // --round4: only the fresh set written after every change, run once.
  const onlyRound4 = process.argv.includes('--round4');
  const scamSet = onlyRound4 ? set.scamsRound4 ?? [] : onlyRound3 ? set.scamsRound3 ?? [] : [...set.scams, ...(set.scamsRound2 ?? []), ...(set.scamsRound3 ?? [])];
  for (const sample of scamSet) record(sample.id, 'scam', sample.text.length, await check(sample.text));
  for (const sample of onlyRound4 ? set.benignMessagesRound4 ?? [] : set.benignMessagesRound3 ?? []) record(sample.id, 'benign', sample.text.length, await check(sample.text));

  for (const url of onlyRound3 || onlyRound4 ? [] : set.benignPages) {
    const tab = await context.newPage();
    try {
      await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await tab.waitForTimeout(1500);
      const text = (await tab.evaluate(() => document.body?.innerText ?? '')).replace(/[ \t]+/g, ' ').trim().slice(0, 20_000);
      if (text.length < 400 || /access denied|are you a robot|enable javascript|verify you are human/i.test(text.slice(0, 600))) {
        skipped.push(`${url} (blocked or empty)`);
      } else {
        record(url, 'benign', text.length, await check(text));
      }
    } catch (err) {
      skipped.push(`${url} (${String(err.message ?? err).split('\n')[0].slice(0, 60)})`);
    } finally {
      await tab.close();
    }
  }

  const scams = rows.filter((r) => r.label === 'scam');
  const benign = rows.filter((r) => r.label === 'benign');
  const modelRows = rows.filter((r) => r.route !== 'not_checked');
  const summary = {
    ranAt: new Date().toISOString(),
    mode: rulesOnly ? 'held-out, built-in rules only (no model), the no-AI baseline' : `held-out, live-web-harness (Chrome ${context.browser()?.version() ?? ''}), on-device model ${model}`,
    scams: scams.length,
    detected: scams.filter((r) => r.correct).length,
    roundThree: {
      scams: scams.filter((r) => r.id.startsWith('round3-') && !r.id.startsWith('round3-ok')).length,
      detected: scams.filter((r) => r.id.startsWith('round3-') && r.correct).length,
      ordinaryMessages: benign.filter((r) => r.id.startsWith('round3-ok')).length,
      falseAlarms: benign.filter((r) => r.id.startsWith('round3-ok') && !r.correct).length,
    },
    roundTwo: { scams: scams.filter((r) => r.id.startsWith('round2')).length, detected: scams.filter((r) => r.id.startsWith('round2') && r.correct).length },
    paused: scams.filter((r) => r.state === 'tripped').length,
    benignPages: benign.length,
    falseAlarms: benign.filter((r) => !r.correct).length,
    pagesSkipped: skipped,
    routes: rows.reduce((acc, r) => ({ ...acc, [r.route]: (acc[r.route] ?? 0) + 1 }), {}),
    totalBytesSentToCloud: rows.reduce((n, r) => n + r.bytesSentToCloud, 0),
    averageChars: Math.round(rows.reduce((n, r) => n + r.chars, 0) / Math.max(1, rows.length)),
    latencyMs: {
      whenAModelRan: { median: quantile(modelRows.map((r) => r.elapsedMs), 0.5), p90: quantile(modelRows.map((r) => r.elapsedMs), 0.9) },
      onDeviceOnly: { median: quantile(rows.filter((r) => r.route === 'on_device').map((r) => r.elapsedMs), 0.5) },
      deviceThenCloud: { median: quantile(rows.filter((r) => r.route === 'device_then_cloud').map((r) => r.elapsedMs), 0.5) },
    },
    rows,
  };
  mkdirSync('eval-results/holdout', { recursive: true });
  const out = `eval-results/holdout/${rulesOnly ? 'rules-only-' : ''}${onlyRound4 ? 'round4-' : ''}${summary.ranAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`\nscams flagged ${summary.detected}/${summary.scams} (${summary.paused} paused) | false alarms on real pages ${summary.falseAlarms}/${summary.benignPages}`);
  console.log(`routes ${JSON.stringify(summary.routes)} | bytes to cloud ${summary.totalBytesSentToCloud} | average text ${summary.averageChars} chars`);
  console.log(`latency when a model ran: median ${summary.latencyMs.whenAModelRan.median}ms, p90 ${summary.latencyMs.whenAModelRan.p90}ms`);
  console.log(skipped.length ? `skipped: ${skipped.join('; ')}` : 'no pages skipped');
  console.log('wrong:', rows.filter((r) => !r.correct).map((r) => `${r.id} (${r.state}, ${r.riskScore}, ${r.route})`).join('; ') || 'none');
  console.log('saved', out);
} catch (err) {
  console.log('HOLDOUT_FAILED', String(err.message ?? err).split('\n')[0].slice(0, 300));
} finally {
  rulesChild?.stdin.end();
  await context.close();
  await server.close();
}
process.exit(0);
