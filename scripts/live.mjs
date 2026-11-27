// Live run against the real Firebase project in .env:
//   npm run build && npm run live
// 1. Developer checks: status, one hybrid call, the whole corpus through the live router.
// 2. Family Guardian: pairing code -> family page -> stop a scam -> alert arrives.
// Results are saved to eval-results/live.json and docs/screenshots.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const EXT = resolve('.output/chrome-mv3');
const SHOTS = resolve('docs/screenshots');
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const DASHBOARD = (/^WXT_DASHBOARD_URL=(.+)$/m.exec(env)?.[1] ?? '').trim();
if (!DASHBOARD) throw new Error('Set WXT_DASHBOARD_URL in .env (and the Firebase web config) first.');
const skipCorpus = process.argv.includes('--no-corpus');
mkdirSync(SHOTS, { recursive: true });
mkdirSync('eval-results', { recursive: true });

const server = await createServer({ root: 'demo', configFile: false, logLevel: 'error', server: { port: 4174, strictPort: true } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'tripwire-live-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let failed = 0;
const record = [];
async function step(name, fn) {
  try {
    const note = await fn();
    record.push({ state: 'pass', name, note: note ?? '' });
    console.log(`  ok    ${name}${note ? `\n        ${note}` : ''}`);
  } catch (err) {
    failed += 1;
    record.push({ state: 'FAIL', name, note: String(err.message ?? err).split('\n')[0] });
    console.log(`  FAIL  ${name}\n        ${String(err.message ?? err).split('\n')[0]}`);
  }
}
const lastPre = async (section) => (await section.locator('pre').last().innerText()).trim();

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
  const id = new URL(worker.url()).host;
  const ext = (path) => `chrome-extension://${id}/${path}`;

  const checks = await context.newPage();
  await checks.goto(ext('checks.html'));
  const card = (title) => checks.locator('section.tw-card', { has: checks.getByRole('heading', { name: title }) });

  await step('status: Firebase configured, App Check initialized', async () => {
    await checks.getByRole('button', { name: 'Refresh status' }).click();
    await card('Status').locator('pre').waitFor({ timeout: 20_000 });
    const status = JSON.parse(await lastPre(card('Status')));
    if (!status.firebaseConfigured) throw new Error('Firebase is not configured in this build');
    if (status.appCheckToken !== 'valid') throw new Error(`App Check token: ${status.appCheckToken}`);
    return `on-device model: ${status.onDevice}, App Check token: ${status.appCheckToken}, offscreen document: ${JSON.stringify(status.offscreenDocument)}`;
  });

  await step('one hybrid call through Firebase AI Logic', async () => {
    await card('Hybrid call').getByRole('button', { name: 'Hybrid call' }).click();
    await card('Hybrid call').locator('pre').waitFor({ timeout: 60_000 });
    const out = await lastPre(card('Hybrid call'));
    if (out.startsWith('Error')) throw new Error(out.slice(0, 300));
    return out.replace(/\s+/g, ' ').slice(0, 160);
  });

  await step('explanations in the browser language (Spanish, cloud path)', async () => {
    await checks.locator('#language').fill('es');
    await checks.getByRole('button', { name: 'Check this text' }).click();
    await card('Check a piece of text').locator('pre').waitFor({ timeout: 60_000 });
    const v = JSON.parse(await lastPre(card('Check a piece of text')));
    await checks.locator('#language').fill('');
    if (v.explanationLanguage !== 'es') throw new Error(`explanationLanguage was ${v.explanationLanguage}`);
    return `${v.route}: ${v.redFlags[0]}`;
  });

  if (!skipCorpus) {
    await step('corpus: 50 samples through the live router', async () => {
      await checks.getByRole('button', { name: 'Run all 50' }).click();
      await checks.getByText('Scams flagged').waitFor({ timeout: 15 * 60_000 });
      const [download] = await Promise.all([checks.waitForEvent('download'), checks.getByRole('button', { name: 'Save results as JSON' }).click()]);
      await download.saveAs('eval-results/live.json');
      const s = JSON.parse(readFileSync('eval-results/live.json', 'utf8'));
      const wrong = s.rows.filter((r) => !r.correct).map((r) => `${r.id} (${r.state}, ${r.riskScore}, ${r.route})`);
      return [
        `scams flagged ${s.detected}/${s.scams} (${s.tripped} paused), false alarms ${s.falsePositives}/${s.benign}`,
        `routes ${JSON.stringify(s.routes)}, bytes to cloud ${s.totalBytesSentToCloud}`,
        wrong.length ? `wrong: ${wrong.join('; ')}` : 'no wrong rows',
      ].join('\n        ');
    });
  }

  let code = '';
  let setup;
  await step('pairing code is created (anonymous Auth + Firestore)', async () => {
    setup = await context.newPage();
    await setup.goto(ext('onboarding.html'));
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Continue' }).click();
    await setup.getByRole('button', { name: 'Show a pairing code' }).click();
    await setup.locator('.tw-code').waitFor({ timeout: 30_000 });
    code = (await setup.locator('.tw-code').innerText()).replace(/\D/g, '');
    if (!/^\d{8}$/.test(code)) throw new Error('no eight-digit code shown');
  });

  // The hosted family page uses reCAPTCHA Enterprise for App Check, which refuses automated
  // browsers. Present the project's debug token on that site only (from .env, never deployed).
  const DEBUG_TOKEN = process.argv.includes('--recaptcha') ? '' : (/^WXT_APPCHECK_DEBUG_TOKEN=(.+)$/m.exec(env)?.[1] ?? '').trim();
  const asTester = async (p) => {
    if (DEBUG_TOKEN) await p.addInitScript((token) => { if (location.protocol.startsWith('http')) self.FIREBASE_APPCHECK_DEBUG_TOKEN = token; }, DEBUG_TOKEN);
    return p;
  };
  const family = await asTester(await context.newPage());
  const familyErrors = [];
  family.on('console', (m) => m.type() === 'error' && familyErrors.push(m.text().slice(0, 300)));
  family.on('pageerror', (e) => familyErrors.push(String(e).slice(0, 300)));
  await step('family page: guest sign-in and pairing with the code', async () => {
    try {
      await family.goto(DASHBOARD);
      await family.getByRole('button', { name: 'Continue without an account' }).click();
      await family.getByLabel('Eight-digit pairing code').fill(code);
      await family.getByLabel('What should we call them?').fill('Mom');
      await family.getByLabel('Your first name').fill('Sam');
      await family.getByRole('button', { name: 'Connect' }).click();
      // Until the person allows it, the family page waits and sees nothing.
      await family.getByText('Waiting for them to tap').waitFor({ timeout: 30_000 });
      // The person sees who is asking before allowing.
      await setup.getByRole('heading', { name: 'Sam just typed your code' }).waitFor({ timeout: 30_000 });
      await setup.getByRole('button', { name: 'Yes, allow' }).click({ timeout: 30_000 });
      await family.getByRole('heading', { name: 'All quiet' }).waitFor({ timeout: 30_000 });
    } catch (err) {
      // Say what the page was showing, so a failure here can be diagnosed from the record.
      const seen = (await family.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
      throw new Error(`${String(err.message).split('\n')[0]} | page: ${seen} | console: ${familyErrors.join(' ; ').slice(0, 600)}`);
    }
  });

  await step('the extension confirms the connection and the code stops working', async () => {
    await setup.bringToFront();
    await setup.getByText('A family member is connected.').waitFor({ timeout: 30_000 });
    await setup.close();
    const stranger = await context.browser()?.newContext?.() ?? null;
    const again = await asTester(await context.newPage());
    await again.goto(DASHBOARD);
    await again.getByRole('button', { name: 'Connect another person' }).click();
    await again.getByLabel('Eight-digit pairing code').fill(code);
    await again.getByRole('button', { name: 'Connect' }).click();
    await again.getByText('That code was not found or has run out.').waitFor({ timeout: 30_000 });
    await again.close();
    void stranger;
  });

  await step('stopping a scam sends an alert that appears on the family page', async () => {
    const page = await context.newPage();
    await page.goto('http://localhost:4174/bank.html');
    await page.locator('tripwire-ui .tw-banner, tripwire-ui .tw-overlay').first().waitFor({ timeout: 30_000 });
    if ((await page.locator('tripwire-ui .tw-overlay').count()) === 0) await page.locator('#cc').focus();
    await page.locator('tripwire-ui').getByRole('button', { name: 'Stop and stay safe' }).click();
    await page.waitForURL(/safe\.html/, { timeout: 15_000 });
    await family.bringToFront();
    await family.getByText('They stopped').waitFor({ timeout: 30_000 });
    await family.waitForTimeout(500);
    await family.screenshot({ path: join(SHOTS, 'family-live.png') });
    return (await family.locator('.tw-alert').first().innerText()).replace(/\s+/g, ' ').slice(0, 200);
  });

  // The family hold, against the live security rules: a family member connected minutes ago can keep a
  // bank transfer on hold, but cannot let it go through (that needs a link approved over a day ago).
  await step('bank transfer hold: new family can keep it on hold but not let it go through', async () => {
    const bank = await context.newPage();
    await bank.goto('http://localhost:4174/transfer.html');
    await bank.waitForTimeout(2500);
    await bank.locator('#amount').focus();
    await bank.locator('tripwire-ui').getByText('Is someone on the phone telling you to move money?').waitFor({ timeout: 30_000 });
    await bank.locator('tripwire-ui').getByText('Your family has been told').waitFor({ timeout: 30_000 });
    await family.bringToFront();
    await family.getByRole('heading', { name: 'Tripwire is holding something right now' }).waitFor({ timeout: 30_000 });
    await family.getByRole('button', { name: 'I talked to them: let it go through' }).click();
    await family.getByText('That did not go through. Family connected in the last day').waitFor({ timeout: 30_000 });
    await family.getByRole('button', { name: 'Keep it on hold for 30 minutes' }).click();
    await family.getByText('You asked them to wait 30 more minutes').waitFor({ timeout: 30_000 });
    await bank.bringToFront();
    await bank.locator('tripwire-ui').getByText('Your family asked you to wait').waitFor({ timeout: 30_000 });
    await bank.screenshot({ path: join(SHOTS, 'hold-family-live.png') });
    await bank.close();
    return 'release refused by the live rules (link approved minutes ago); 30-minute extension accepted and shown on the pause';
  });
} finally {
  await context.close();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} step(s) failed.` : '\nAll live steps passed.');
writeFileSync('eval-results/live-checks.json', JSON.stringify({ ranAt: new Date().toISOString(), where: 'live Firebase project, Chromium with the extension loaded', steps: record }, null, 2));
process.exit(failed ? 1 : 0);
