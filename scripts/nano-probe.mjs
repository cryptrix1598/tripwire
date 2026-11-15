// Probe: is Chrome's on-device model (Gemini Nano) usable on this machine?
//   node scripts/nano-probe.mjs            report availability
//   node scripts/nano-probe.mjs --download start the one-time model download and wait
// Uses the installed Google Chrome with its own profile in .nano-profile/ (gitignored),
// so the download happens once and your normal Chrome profile is not touched.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const download = process.argv.includes('--download');
// The feature list Playwright disables by default, read from its own bundle so the flag can be replaced exactly.
const bundle = readFileSync('node_modules/playwright-core/lib/coreBundle.js', 'utf8');
const playwrightDisabled = (/disabledFeatures = \[([\s\S]*?)\];/.exec(bundle)?.[1] ?? '')
  .split('\n')
  .map((line) => /^\s*"([^"]+)"/.exec(line)?.[1])
  .filter(Boolean);
// No hot reload: a file change must not reload the page in the middle of a long download or corpus run.
const server = await createServer({ configFile: resolve('dashboard/vite.config.ts'), logLevel: 'error', server: { hmr: false, watch: null } });
await server.listen();
const context = await chromium.launchPersistentContext(resolve('.nano-profile'), {
  channel: 'chrome',
  headless: !process.argv.includes('--headed'),
  // Playwright's default flags switch off component updates and optimization
  // hints, which is exactly how Chrome delivers the on-device model. Drop them.
  ignoreDefaultArgs: ['--disable-background-networking', '--disable-component-update', `--disable-features=${playwrightDisabled.join(',')}`],
  args: [
    `--disable-features=${playwrightDisabled.filter((f) => f !== 'OptimizationHints').join(',')}`,
    '--enable-features=AIPromptAPI,AIPromptAPIMultimodalInput,OptimizationGuideOnDeviceModel:BypassPerfRequirement/true',
  ],
});
try {
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => /AI|model|flag/i.test(m.text()) && console.log('console:', m.text().slice(0, 200)));
  await page.goto('http://localhost:5174/preview.html?page=pair');
  const opts = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
  const probe = () => page.evaluate(async (o) => (typeof LanguageModel === 'undefined' ? 'no LanguageModel API' : await LanguageModel.availability(o)), opts);
  let state = await probe();
  // A fresh profile reports "unavailable" until Chrome has registered the model component.
  for (let i = 0; i < 9 && state === 'unavailable'; i++) {
    await page.waitForTimeout(10_000);
    state = await probe();
  }
  console.log('Chrome', context.browser()?.version() ?? '', '| availability:', state);
  if (state === 'unavailable') {
    const version = await context.newPage();
    await version.goto('chrome://version').catch(() => undefined);
    const commandLine = await version.locator('#command_line').innerText().catch(() => '');
    console.log('still blocked by flags:', ['OptimizationHints', '--disable-component-update', '--disable-background-networking'].filter((f) => commandLine.includes(f)).join(', ') || 'none');
    await version.close();
  }
  if (download && (state === 'downloadable' || state === 'downloading')) {
    await page.locator('body').click(); // user activation
    const started = Date.now();
    const result = page.evaluate(async (o) => {
      const session = await LanguageModel.create({ ...o, monitor: (m) => m.addEventListener('downloadprogress', (e) => (window.__pct = Math.round(e.loaded * 100))) });
      const reply = await session.prompt('Reply with the single word: ready');
      session.destroy();
      return reply;
    }, opts);
    const ticker = setInterval(async () => console.log(`  download ${await page.evaluate(() => window.__pct ?? 0).catch(() => '?')}% after ${Math.round((Date.now() - started) / 1000)}s`), 30_000);
    try {
      console.log('first on-device reply:', String(await result).slice(0, 80));
    } finally {
      clearInterval(ticker);
    }
    state = await probe();
    console.log('availability now:', state);
  }

  // --checks: run the Developer checks page (as a web page) with the on-device model.
  if (process.argv.includes('--checks') && state === 'available') {
    await page.goto('http://localhost:5174/preview.html?page=checks');
    const card = (title) => page.locator('section.tw-card', { has: page.getByRole('heading', { name: title }) });
    const pre = async (title, timeout = 120_000) => {
      await card(title).locator('pre').waitFor({ timeout });
      return (await card(title).locator('pre').last().innerText()).replace(/\s+/g, ' ');
    };
    await page.getByRole('button', { name: 'Refresh status' }).click();
    console.log('status:', await pre('Status'));
    await card('Hybrid call').getByRole('button', { name: 'Hybrid call' }).click();
    console.log('hybrid call:', (await pre('Hybrid call')).slice(0, 200));
    await page.getByRole('button', { name: 'Check this text' }).click();
    const v = JSON.parse(await pre('Check a piece of text', 180_000));
    console.log('sample verdict:', JSON.stringify({ state: v.state, score: v.riskScore, type: v.scamType, route: v.route, bytes: v.bytesSentToCloud, redactions: v.redactionCount, failSafe: v.failSafe, ms: v.elapsedMs, flags: v.redFlags }));
    // --lang es: a clear scam, explained in another language. A local trip must stay at 0 bytes.
    const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : '';
    if (lang) {
      const scam = JSON.parse(readFileSync('corpus/scams.json', 'utf8')).find((s) => s.id === 'scam-01-tech-support-popup');
      await page.locator('#sample').fill(scam.text);
      await page.locator('#language').fill(lang);
      await page.getByRole('button', { name: 'Check this text' }).click();
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: 'Check this text' }).waitFor({ timeout: 180_000 });
      const t = JSON.parse(await pre('Check a piece of text', 180_000));
      console.log(`in "${lang}":`, JSON.stringify({ state: t.state, route: t.route, bytes: t.bytesSentToCloud, explanationLanguage: t.explanationLanguage ?? 'en (not translated)', ms: t.elapsedMs, explanation: t.explanation, flags: t.redFlags }));
    }
    if (process.argv.includes('--corpus')) {
      await page.getByRole('button', { name: 'Run all 50' }).click();
      await page.getByText('Scams flagged').waitFor({ timeout: 40 * 60_000 });
      const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save results as JSON' }).click()]);
      await file.saveAs('eval-results/live-on-device.json');
      const s = JSON.parse(readFileSync('eval-results/live-on-device.json', 'utf8'));
      const wrong = s.rows.filter((r) => !r.correct).map((r) => `${r.id} (${r.state}, ${r.riskScore}, ${r.route})`);
      console.log(`corpus: scams flagged ${s.detected}/${s.scams} (${s.tripped} paused), false alarms ${s.falsePositives}/${s.benign}`);
      console.log(`routes ${JSON.stringify(s.routes)}, bytes to cloud ${s.totalBytesSentToCloud}`);
      console.log(wrong.length ? `wrong: ${wrong.join('; ')}` : 'no wrong rows');
    }
  }
} catch (err) {
  console.log('PROBE_FAILED', String(err.message ?? err).split('\n')[0].slice(0, 300));
} finally {
  await context.close();
  await server.close();
}
process.exit(0);
