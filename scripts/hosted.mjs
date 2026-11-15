// Checks the zero-install demo on the hosted site, in a plain browser with NO extension:
//   npm run hosted
// The practice pages load /try.js, which runs the extension's content script,
// router and UI in the page, with inference through Firebase AI Logic.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const SITE = (process.argv.find((a) => a.startsWith('http')) ?? /^WXT_DASHBOARD_URL=(.+)$/m.exec(env)?.[1] ?? '').trim().replace(/\/+$/, '');
if (!SITE) throw new Error('Pass the site address, or set WXT_DASHBOARD_URL in .env');
const SHOTS = resolve('docs/screenshots');
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const ui = (selector) => page.locator(`tripwire-ui ${selector}`);
let failed = 0;
async function step(name, fn) {
  try {
    const note = await fn();
    console.log(`  ok    ${name}${note ? `\n        ${note}` : ''}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${name}\n        ${String(err.message ?? err).split('\n')[0]}`);
  }
}

try {
  await step('fake bank page is flagged with no extension installed', async () => {
    await page.goto(`${SITE}/demo/bank.html`);
    await ui('.tw-banner, .tw-overlay').first().waitFor({ timeout: 45_000 });
    if ((await ui('.tw-overlay').count()) === 0) await page.locator('#cc').focus();
    await ui('.tw-overlay').waitFor({ timeout: 30_000 });
    await page.locator('tripwire-ui').getByRole('button', { name: 'Why did Tripwire stop me?' }).click();
    const route = (await ui('.tw-route').first().innerText()).replace(/\s+/g, ' ');
    const receipt = page.locator('tripwire-ui').getByRole('button', { name: 'See exactly what was sent' });
    let sent = '';
    if (await receipt.count()) {
      await receipt.click();
      sent = (await ui('.tw-sent').innerText()).replace(/\s+/g, ' ');
      if (/1-855-555-0119/.test(sent)) throw new Error('the phone number on the page was sent unredacted');
    }
    await page.screenshot({ path: join(SHOTS, 'web-demo-pause.png') });
    return `route: ${route}${sent ? `\n        sent (start): ${sent.slice(0, 150)}` : ''}`;
  });

  await step('"Stop and stay safe" goes to the "you stopped" page', async () => {
    await page.locator('tripwire-ui').getByRole('button', { name: 'Stop and stay safe' }).click();
    await page.waitForURL(/stopped\.html/, { timeout: 15_000 });
    await page.getByRole('heading', { name: 'That was the right call.' }).waitFor({ timeout: 15_000 });
  });

  await step('ordinary checkout stays silent, even with a card number typed', async () => {
    await page.goto(`${SITE}/demo/shop.html`);
    await page.locator('#cc').click();
    await page.keyboard.type('4111 1111 1111 1111', { delay: 20 });
    await page.waitForTimeout(6000);
    if ((await page.locator('tripwire-ui').count()) !== 0) throw new Error('Tripwire appeared on a safe page');
  });

  await step('gift card demand pauses on the code field', async () => {
    await page.goto(`${SITE}/demo/giftcard.html`);
    await ui('.tw-banner, .tw-overlay').first().waitFor({ timeout: 45_000 });
    if ((await ui('.tw-overlay').count()) === 0) await page.locator('#gc').focus();
    await ui('.tw-overlay').waitFor({ timeout: 30_000 });
  });
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} step(s) failed.` : '\nThe hosted demo works without the extension.');
process.exit(failed ? 1 : 0);
