// End-to-end run in a real Chromium with the built extension loaded:
//   npm run build && npm run e2e
// It drives the practice pages in demo/ and saves screenshots to docs/screenshots.
// With no .env this exercises the built-in-rules path; with Firebase configured
// the same steps run through the live cloud path.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const EXT = resolve('.output/chrome-mv3');
const SHOTS = resolve('docs/screenshots');
const DEMO = 'http://localhost:4174';
if (!existsSync(join(EXT, 'manifest.json'))) throw new Error('Build the extension first: npm run build');
mkdirSync(SHOTS, { recursive: true });

const server = await createServer({ root: 'demo', configFile: false, logLevel: 'error', server: { port: 4174, strictPort: true } });
await server.listen();
// The family page's development gallery (sample data, no Firebase needed).
const family = await createServer({ configFile: resolve('dashboard/vite.config.ts'), logLevel: 'error' });
await family.listen();
const profile = mkdtempSync(join(tmpdir(), 'tripwire-e2e-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: !process.argv.includes('--headed'),
  viewport: { width: 1280, height: 800 },
  reducedMotion: 'reduce', // screenshots must never catch a fade half way
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['pass', name]);
    console.log(`  ok    ${name}`);
  } catch (err) {
    results.push(['FAIL', name]);
    console.log(`  FAIL  ${name}\n        ${String(err.message ?? err).split('\n')[0]}`);
  }
}
// Accessibility: axe-core runs on every Tripwire surface that gets a screenshot.
// WCAG A/AA problems fail the run; AAA contrast is reported for information.
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const a11y = { aa: [], aaa: [] };
async function audit(page, name, inPage = false) {
  await page.evaluate(axeSource);
  const found = await page.evaluate(async (scoped) => {
    const root = scoped ? document.querySelector('tripwire-ui') : document;
    const run = (values, type = 'tag') => window.axe.run(root, { runOnly: { type, values } });
    const list = (r) => r.violations.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes[0].html.slice(0, 90)}`);
    return { aa: list(await run(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])), aaa: list(await run(['color-contrast-enhanced'], 'rule')) };
  }, inPage);
  a11y.aa.push(...found.aa.map((v) => `${name}: ${v}`));
  a11y.aaa.push(...found.aaa.map((v) => `${name}: ${v}`));
}
const shot = async (page, name, inPage = false) => {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  await audit(page, name, inPage);
};
const ui = (page, selector = '') => page.locator(`tripwire-ui ${selector}`.trim());
const expectVisible = (locator, timeout = 15_000) => locator.first().waitFor({ state: 'visible', timeout });
const text = async (locator) => (await locator.first().innerText()).replace(/\s+/g, ' ');

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
  const id = new URL(worker.url()).host;
  const ext = (path) => `chrome-extension://${id}/${path}`;
  console.log(`Extension ${id}\n`);

  await step('setup opens on install and walks through three screens', async () => {
    const page = context.pages().find((p) => p.url().includes('onboarding.html')) ?? (await context.waitForEvent('page', { predicate: (p) => p.url().includes('onboarding.html'), timeout: 10_000 }));
    await expectVisible(page.getByRole('heading', { name: 'Tripwire steps in at the moment it matters.' }));
    await shot(page, 'onboarding-1-what');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectVisible(page.getByText('The most that is ever sent'));
    await page.waitForTimeout(800);
    await shot(page, 'onboarding-2-privacy');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectVisible(page.getByRole('button', { name: 'Show a pairing code' }));
    await shot(page, 'onboarding-3-family');
    await page.close();
  });

  const page = await context.newPage();

  await step('ordinary checkout: nothing is added to the page, even with a card number typed', async () => {
    await page.goto(`${DEMO}/shop.html`);
    await page.locator('#cc').click();
    await page.keyboard.type('4111 1111 1111 1111', { delay: 20 });
    await page.waitForTimeout(4000);
    if ((await page.locator('tripwire-ui').count()) !== 0) throw new Error('Tripwire UI appeared on a safe page');
  });

  let routeLine = '';
  await step('fake bank message: flagged on reading, with reasons and a route badge', async () => {
    await page.goto(`${DEMO}/bank.html`);
    await expectVisible(ui(page, '.tw-banner, .tw-overlay'), 30_000);
    if ((await ui(page, '.tw-overlay').count()) > 0) {
      // With a live model the page is confidently a scam, so Tripwire pauses on reading.
      await ui(page).getByRole('button', { name: 'Why did Tripwire stop me?' }).click();
      await expectVisible(ui(page, '.tw-flags li'));
      routeLine = await text(ui(page, '.tw-route'));
      await shot(page, 'pause-live', true);
      return;
    }
    await page.waitForTimeout(500);
    await shot(page, 'caution-banner', true);
    await ui(page, '.tw-banner').getByRole('button', { name: 'Why?' }).click();
    await expectVisible(ui(page, '.tw-flags li'));
    routeLine = await text(ui(page, '.tw-route'));
    await shot(page, 'caution-banner-why', true);
  });
  console.log(`        route shown: ${routeLine}`);

  await step('fake bank message: focusing the card field pauses the page', async () => {
    const alreadyPaused = (await ui(page, '.tw-overlay').count()) > 0;
    if (!alreadyPaused) await page.locator('#cc').focus();
    await expectVisible(ui(page, '.tw-overlay'));
    const said = await text(ui(page, '.tw-overlay'));
    if (!said.includes('Did someone call, text, or email you')) throw new Error('pause question missing');
    await page.waitForTimeout(400);
    if (!alreadyPaused) await shot(page, 'pause', true);
  });

  await step('"Stop and stay safe" leaves the page for the "you stopped" screen', async () => {
    await ui(page).getByRole('button', { name: 'Stop and stay safe' }).click();
    await page.waitForURL(/safe\.html/, { timeout: 10_000 });
    await expectVisible(page.getByRole('heading', { name: 'That was the right call.' }));
    await shot(page, 'you-stopped');
  });

  await step('gift card demand: code field pauses; "I\'m sure, continue" lets the person through once', async () => {
    await page.goto(`${DEMO}/giftcard.html`);
    await expectVisible(ui(page, '.tw-banner, .tw-overlay'));
    if ((await ui(page, '.tw-overlay').count()) === 0) await page.locator('#gc').focus();
    await expectVisible(ui(page, '.tw-overlay'));
    await ui(page).getByRole('button', { name: 'I’m sure, continue' }).click();
    await ui(page, '.tw-overlay').waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('#gc').focus();
    await page.waitForTimeout(1500);
    if ((await ui(page, '.tw-overlay').count()) !== 0) throw new Error('paused again after the person chose to continue');
  });

  await step('investment offer: wallet field pauses the page', async () => {
    await page.goto(`${DEMO}/crypto.html`);
    await expectVisible(ui(page, '.tw-banner, .tw-overlay'));
    if ((await ui(page, '.tw-overlay').count()) === 0) await page.locator('#wallet').focus();
    await expectVisible(ui(page, '.tw-overlay'));
  });

  await step('a hostile page that deletes the warning gets it back, then loses the tab to an extension page', async () => {
    // Still on the investment page, paused. The page tries to remove Tripwire.
    await page.evaluate(() => document.querySelector('tripwire-ui')?.remove());
    await expectVisible(ui(page, '.tw-overlay'), 5000);
    // It keeps trying. Tripwire moves the pause to its own page, which the site cannot touch.
    const fight = page.evaluate(() => new Promise((done) => { let n = 0; const t = setInterval(() => { document.querySelector('tripwire-ui')?.remove(); if (++n > 40) { clearInterval(t); done(true); } }, 150); })).catch(() => undefined);
    await page.waitForURL(/pause.html/, { timeout: 15_000 });
    await fight;
    await expectVisible(page.getByRole('button', { name: 'Stop and stay safe' }));
    await shot(page, 'pause-moved-to-extension-page');
  });

  await step('fake tech support: the phone link pauses instead of dialling', async () => {
    await page.goto(`${DEMO}/support.html`);
    await expectVisible(ui(page, '.tw-banner, .tw-overlay'));
    if ((await ui(page, '.tw-overlay').count()) === 0) await page.getByRole('link', { name: 'Call support now' }).click();
    await expectVisible(ui(page, '.tw-overlay'));
    await ui(page).getByRole('button', { name: 'I’m sure, continue' }).click();
    await ui(page, '.tw-overlay').waitFor({ state: 'detached', timeout: 5000 });
  });

  await step('fake tech support: a remote-access download is paused in its own tab', async () => {
    const [paused] = await Promise.all([
      context.waitForEvent('page', { predicate: (p) => p.url().includes('pause.html'), timeout: 15_000 }),
      page.getByRole('link', { name: 'Download remote support tool' }).click(),
    ]);
    await expectVisible(paused.getByText('You are about to install a program that lets a stranger control this computer.'));
    await shot(paused, 'pause-download');
    await paused.getByRole('button', { name: 'Stop and stay safe' }).click();
    await paused.waitForURL(/safe\.html/, { timeout: 10_000 });
    await paused.close();
  });

  await step('settings: a trusted site is left alone; removing it brings protection back', async () => {
    const settings = await context.newPage();
    await settings.goto(ext('settings.html'));
    await expectVisible(settings.getByRole('heading', { name: 'How careful should Tripwire be?' }));
    await settings.getByLabel('Site name').fill('not a site');
    await settings.getByRole('button', { name: 'Add site' }).click();
    await expectVisible(settings.getByText('That does not look like a site name.'));
    await settings.getByLabel('Site name').fill('http://localhost:4174/bank.html');
    await settings.getByRole('button', { name: 'Add site' }).click();
    await expectVisible(settings.getByText('localhost added.'));
    await settings.getByLabel('Warning level').focus();
    await settings.keyboard.press('ArrowRight');
    await expectVisible(settings.getByText('Tripwire speaks up sooner'));
    await settings.waitForTimeout(300);
    await shot(settings, 'settings');
    await settings.keyboard.press('ArrowLeft');

    await page.goto(`${DEMO}/bank.html`);
    await page.locator('#cc').click();
    await page.waitForTimeout(5000);
    if ((await page.locator('tripwire-ui').count()) !== 0) throw new Error('Tripwire appeared on a trusted site');

    await settings.bringToFront();
    await settings.getByRole('button', { name: 'Remove localhost' }).click();
    await expectVisible(settings.getByText('No trusted sites yet.'));
    await settings.close();
    await page.bringToFront();
    await page.goto(`${DEMO}/bank.html`);
    await expectVisible(ui(page, '.tw-banner, .tw-overlay'), 30_000);
  });

  await step('popup renders its three facts', async () => {
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 380, height: 560 });
    await popup.goto(ext('popup.html'));
    await expectVisible(popup.getByRole('heading', { name: 'Tripwire is watching for scams.' }));
    await expectVisible(popup.getByText('Family alerts'));
    await popup.waitForTimeout(800);
    await shot(popup, 'popup');
    await popup.close();
  });

  await step('family page: connect screen and alert feed render (sample data)', async () => {
    const fam = await context.newPage();
    await fam.goto('http://localhost:5174/preview.html?page=pair');
    await expectVisible(fam.getByRole('heading', { name: 'Connect to their Tripwire' }));
    await fam.waitForTimeout(500);
    await shot(fam, 'family-connect');
    await fam.goto('http://localhost:5174/preview.html?page=alerts');
    await expectVisible(fam.getByText('They continued anyway'));
    await fam.waitForTimeout(500);
    await shot(fam, 'family-alerts');
    await fam.close();
  });
} finally {
  await context.close();
  await server.close();
  await family.close();
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter(([state]) => state === 'FAIL').length;
console.log(`\n${results.length - failed} of ${results.length} steps passed. Screenshots: docs/screenshots`);
console.log(`Accessibility (axe-core, WCAG 2.2 A/AA): ${a11y.aa.length} problem(s)`);
a11y.aa.forEach((line) => console.log(`  ${line}`));
console.log(`AAA contrast, for information: ${a11y.aaa.length} note(s)`);
a11y.aaa.forEach((line) => console.log(`  ${line}`));
writeFileSync('eval-results/e2e.json', JSON.stringify({ ranAt: new Date().toISOString(), browser: 'Chromium (Playwright), extension loaded', steps: results.map(([state, name]) => ({ state, name })), accessibility: { tool: 'axe-core', wcagAAProblems: a11y.aa, aaaContrastNotes: a11y.aaa } }, null, 2));
process.exit(failed || a11y.aa.length ? 1 : 0);
