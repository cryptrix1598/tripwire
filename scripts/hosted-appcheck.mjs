// Does the hosted family page get an App Check token (reCAPTCHA Enterprise)?
// Opens the page in a plain headless Chromium, signs in as a guest and lists
// every request to App Check, reCAPTCHA, Auth and Firestore with its status.
//   node scripts/hosted-appcheck.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const DASHBOARD = env.WXT_DASHBOARD_URL || 'https://tripwire-buildhybridai.web.app';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const seen = [];
page.on('response', async (r) => {
  const u = r.url();
  if (!/appcheck|recaptcha|identitytoolkit|firestore|firebaseml|securetoken/.test(u)) return;
  let body = '';
  if (r.status() >= 400) body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  seen.push(`${r.status()} ${u.split('?')[0].slice(0, 110)}${body ? ` | ${body}` : ''}`);
});
page.on('requestfailed', (r) => seen.push(`FAILED ${r.url().split('?')[0].slice(0, 110)} | ${r.failure()?.errorText}`));
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 400)));

await page.goto(DASHBOARD);
await page.getByRole('button', { name: 'Continue without an account' }).click();
await page.getByLabel('Six-digit pairing code').fill('000000');
await page.getByLabel('What should we call them?').fill('Test');
await page.getByRole('button', { name: 'Connect' }).click();
await page.waitForTimeout(12_000);
console.log('PAGE:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500));
console.log('\nREQUESTS:\n' + [...new Set(seen)].join('\n'));
console.log('\nCONSOLE:\n' + [...new Set(errors)].join('\n'));
await browser.close();
