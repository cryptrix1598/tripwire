// The real, built extension with Gemini Nano answering, by automation:
//   npm run build && node scripts/extension-nano.mjs [--corpus]
// Branded Chrome no longer accepts --load-extension, so the extension is loaded over the
// DevTools protocol (Extensions.loadUnpacked, allowed with --enable-unsafe-extension-debugging
// on the pipe connection Playwright already uses). Uses the .nano-profile/ that
// `node scripts/nano-probe.mjs --download` prepared. Headless; nothing appears on screen.
// Writes eval-results/extension-on-device.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const EXT = resolve('.output/chrome-mv3');
const bundle = readFileSync('node_modules/playwright-core/lib/coreBundle.js', 'utf8');
const playwrightDisabled = (/disabledFeatures = \[([\s\S]*?)\];/.exec(bundle)?.[1] ?? '')
  .split('\n')
  .map((line) => /^\s*"([^"]+)"/.exec(line)?.[1])
  .filter(Boolean);

const server = await createServer({ root: 'demo', configFile: false, logLevel: 'error', server: { port: 4174, strictPort: true, hmr: false, watch: null } });
await server.listen();
const context = await chromium.launchPersistentContext(resolve('.nano-profile'), {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1280, height: 800 },
  ignoreDefaultArgs: ['--disable-background-networking', '--disable-component-update', `--disable-features=${playwrightDisabled.join(',')}`, '--disable-extensions'],
  args: [
    `--disable-features=${playwrightDisabled.filter((f) => f !== 'OptimizationHints').join(',')}`,
    '--enable-features=AIPromptAPI,OptimizationGuideOnDeviceModel',
    '--enable-unsafe-extension-debugging',
  ],
});

const steps = [];
let failed = 0;
async function step(name, fn) {
  try {
    const note = (await fn()) ?? '';
    steps.push({ state: 'pass', name, note });
    console.log(`  ok    ${name}${note ? `\n        ${note}` : ''}`);
  } catch (err) {
    failed += 1;
    const note = String(err?.message ?? err).split('\n')[0];
    steps.push({ state: 'FAIL', name, note });
    console.log(`  FAIL  ${name}\n        ${note}`);
  }
}

let version = '';
try {
  const browser = context.browser();
  const cdp = await browser.newBrowserCDPSession();
  version = (await cdp.send('Browser.getVersion')).product;
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const ext = (path) => `chrome-extension://${id}/${path}`;

  const checks = await context.newPage();
  await checks.goto(ext('checks.html'));
  const card = (title) => checks.locator('section.tw-card', { has: checks.getByRole('heading', { name: title }) });

  await step('the extension loads and its offscreen document finds Gemini Nano', async () => {
    let text = '';
    for (let i = 0; i < 20; i++) {
      await checks.getByRole('button', { name: 'Refresh status' }).click();
      await card('Status').locator('pre').waitFor({ timeout: 20_000 });
      text = (await card('Status').locator('pre').last().innerText()).replace(/\s+/g, ' ');
      if (/"onDevice":\s*"available"/.test(text)) break;
      await checks.waitForTimeout(3000);
    }
    if (!/"onDevice":\s*"available"/.test(text)) throw new Error(`model not available in the extension: ${text.slice(0, 200)}`);
    return text.slice(0, 220);
  });

  await step('a scam message is stopped, and the route is reported', async () => {
    await card('Check a piece of text').locator('textarea').first().fill(
      'Your bank account has been suspended. Call 1-855-555-0119 now and read us the one-time code we text you. Do not tell anyone at the branch, this is confidential.',
    );
    await checks.getByRole('button', { name: 'Check this text' }).click();
    await card('Check a piece of text').locator('pre').waitFor({ timeout: 90_000 });
    const v = JSON.parse((await card('Check a piece of text').locator('pre').last().innerText()).trim());
    if (v.state !== 'tripped') throw new Error(`got ${v.state} via ${v.route}`);
    if (!['on_device', 'device_then_cloud'].includes(v.route)) throw new Error(`the on-device model was not asked first: ${v.route}`);
    return `${v.state} via ${v.route}, ${v.bytesSentToCloud} bytes sent, risk ${v.riskScore}`;
  });

  await step('the practice bank page is paused: "Checked on your device · nothing left your computer"', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:4174/bank.html');
    const ui = (s) => page.locator(`tripwire-ui ${s}`);
    await ui('.tw-banner, .tw-overlay').first().waitFor({ timeout: 90_000 });
    if ((await ui('.tw-overlay').count()) === 0) await page.locator('#cc').focus();
    await ui('.tw-overlay').waitFor({ timeout: 90_000 });
    const route = (await ui('.tw-overlay').innerText()).match(/Checked on your device[^\n]*/)?.[0];
    if (!route) throw new Error('paused, but not on the device route');
    await page.screenshot({ path: 'docs/screenshots/extension-on-device.png' });
    return route.replace(/\s+/g, ' ');
  });

  await step('a phone call the person describes is checked, the on-device model first', async () => {
    const call = await context.newPage();
    await call.goto(ext('call.html'));
    for (const choice of ['The government, Social Security or Medicare', 'Give my Social Security, Medicare or bank details', 'Rushing me or threatening']) {
      await call.getByRole('button', { name: choice }).click();
    }
    await call.getByRole('button', { name: 'Check this call' }).click();
    await call.getByRole('heading', { name: /Hang up now|Be careful/ }).waitFor({ timeout: 90_000 });
    await call.screenshot({ path: 'docs/screenshots/call-check-on-device.png' });
    const route = (await call.locator('.tw-route').innerText()).replace(/\s+/g, ' ');
    const heading = await call.locator('h2').first().innerText();
    await call.close();
    return `${heading} | ${route}`;
  });

  await step('an ordinary shop page stays silent', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:4174/shop.html');
    await page.waitForTimeout(12_000);
    const shown = await page.locator('tripwire-ui .tw-banner, tripwire-ui .tw-overlay').count();
    if (shown) throw new Error('a warning appeared on the ordinary shop page');
  });
  if (process.argv.includes('--calls')) {
    await step('phone-call test set (corpus/calls.json), tapped on the call page', async () => {
      const LABEL = {
        bank: 'My bank', government: 'The government, Social Security or Medicare', company: 'A company like Amazon or Microsoft', family: 'Family or a friend in trouble', other: 'I don’t know',
        money: 'Pay a bill, a fine or a fee', safe_account: 'Move my money to a “safe” account', gift_cards: 'Buy gift cards', crypto: 'Send crypto or use a Bitcoin machine', code: 'Read them a code from my phone', details: 'Give my Social Security, Medicare or bank details', computer: 'Let them into my computer', nothing: 'Nothing yet',
        rushing: 'Rushing me or threatening', secret: 'Telling me to keep it secret', stay_on_line: 'Telling me to stay on the line', patient: 'Calm, and said I can call back',
      };
      const set = JSON.parse(readFileSync('corpus/calls.json', 'utf8'));
      const rows = [];
      for (const c of set.calls) {
        const call = await context.newPage();
        await call.goto(ext('call.html'));
        for (const key of [c.who, ...c.want, ...c.how]) await call.getByRole('button', { name: LABEL[key], exact: true }).click();
        if (c.notes) await call.getByLabel('Anything else they said? (You can skip this.)').fill(c.notes);
        const t0 = Date.now();
        await call.getByRole('button', { name: 'Check this call' }).click();
        await call.locator('section[aria-live] .tw-route').waitFor({ timeout: 90_000 });
        const heading = await call.locator('h2').first().innerText();
        const route = (await call.locator('.tw-route').innerText()).replace(/\s+/g, ' ');
        const flagged = !/Nothing here sounds like a scam/.test(heading);
        rows.push({ id: c.id, label: c.label, heading, route, ms: Date.now() - t0, correct: c.label === 'scam' ? flagged : !flagged });
        await call.close();
      }
      const scams = rows.filter((r) => r.label === 'scam');
      const benign = rows.filter((r) => r.label === 'benign');
      const summary = {
        ranAt: new Date().toISOString(),
        where: `the built extension in ${version}, headless, Gemini Nano on the device, driven by tapping the call page`,
        scams: scams.length, caught: scams.filter((r) => r.correct).length,
        benign: benign.length, falseAlarms: benign.filter((r) => !r.correct).length,
        onDevice: rows.filter((r) => /Checked on your device/.test(r.route)).length,
        rows,
      };
      writeFileSync('eval-results/calls-on-device.json', JSON.stringify(summary, null, 2));
      const wrong = rows.filter((r) => !r.correct).map((r) => `${r.id} (${r.heading})`);
      return `scams ${summary.caught}/${summary.scams}, false alarms ${summary.falseAlarms}/${summary.benign}, decided on the device ${summary.onDevice}/${rows.length}${wrong.length ? `, wrong: ${wrong.join('; ')}` : ''}`;
    });
  }
  if (process.argv.includes('--corpus')) {
    await step('corpus: 50 samples through the router inside the extension', async () => {
      await checks.bringToFront();
      await checks.getByRole('button', { name: 'Run all 50' }).click();
      await checks.getByText('Scams flagged').waitFor({ timeout: 25 * 60_000 });
      const [download] = await Promise.all([checks.waitForEvent('download'), checks.getByRole('button', { name: 'Save results as JSON' }).click()]);
      const file = `eval-results/on-device/extension-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await download.saveAs(file);
      const r = JSON.parse(readFileSync(file, 'utf8'));
      const wrong = r.rows.filter((row) => !row.correct).map((row) => `${row.id} (${row.state}, ${row.route})`);
      return `scams ${r.detected}/${r.scams}, false alarms ${r.falsePositives}/${r.benign}, routes ${JSON.stringify(r.routes)}, bytes ${r.totalBytesSentToCloud}${wrong.length ? `, wrong: ${wrong.join('; ')}` : ''}`;
    });
  }
} catch (err) {
  failed += 1;
  steps.push({ state: 'FAIL', name: 'load the extension over the DevTools protocol', note: String(err?.message ?? err).split('\n')[0] });
  console.log(`  FAIL  setup: ${String(err?.message ?? err).split('\n')[0]}`);
} finally {
  await context.close();
  await server.close();
}
writeFileSync(
  'eval-results/extension-on-device.json',
  JSON.stringify({ ranAt: new Date().toISOString(), where: `the built extension in ${version || 'Google Chrome'}, headless, Gemini Nano on the device`, steps }, null, 2),
);
console.log(failed ? `\n${failed} step(s) failed.` : '\nAll steps passed.');
process.exit(failed ? 1 : 0);
