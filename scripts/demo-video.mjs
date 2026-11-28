// Records the demo scenes in Chrome with Gemini Nano, headless, at 3840x2160, then builds each scene
// as a constant 60 fps 4K MP4 with ffmpeg. Usage: npm run build && node scripts/demo-video.mjs
// Output: video/raw/<scene>.mp4 (frames are kept only until each scene is encoded).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const EXT = resolve('.output/chrome-mv3');
const OUT = resolve('video/raw');
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const bundle = readFileSync('node_modules/playwright-core/lib/coreBundle.js', 'utf8');
const playwrightDisabled = (/disabledFeatures = \[([\s\S]*?)\];/.exec(bundle)?.[1] ?? '')
  .split('\n')
  .map((line) => /^\s*"([^"]+)"/.exec(line)?.[1])
  .filter(Boolean);

const server = await createServer({ root: 'demo', configFile: false, logLevel: 'error', server: { port: 4174, strictPort: true, hmr: false, watch: null } });
await server.listen();
const FAMILY = process.argv.includes('--family');
const OFFLINE = process.argv.includes('--offline');
const context = FAMILY
  ? await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tripwire-film-')), {
      channel: 'chromium', headless: true, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    })
  : await chromium.launchPersistentContext(resolve('.nano-profile'), {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 3,
  ignoreDefaultArgs: ['--disable-background-networking', '--disable-component-update', `--disable-features=${playwrightDisabled.join(',')}`, '--disable-extensions'],
  args: [
    `--disable-features=${playwrightDisabled.filter((f) => f !== 'OptimizationHints').join(',')}`,
    '--enable-features=AIPromptAPI,OptimizationGuideOnDeviceModel',
    '--enable-unsafe-extension-debugging',
    ...(OFFLINE ? ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost'] : []),
  ],
});

// A visible pointer: headless Chrome draws none, so every page gets a soft dot that follows the mouse.
await context.addInitScript(() => {
  const put = () => {
    if (document.getElementById('__demo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.style.cssText =
      'position:fixed;left:-40px;top:-40px;width:26px;height:26px;border-radius:50%;background:rgba(20,40,90,.28);border:2px solid rgba(20,40,90,.85);box-shadow:0 0 0 3px rgba(255,255,255,.7);z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);transition:transform .12s ease';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'translate(-50%,-50%) scale(.75)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(-50%,-50%)'; }, true);
  };
  if (document.documentElement) put();
  else addEventListener('DOMContentLoaded', put);
});

let mouse = { x: 640, y: 400 };
/** Glide to an element (or a point) and click it, like a person would. */
async function clickOn(page, target, { click = true } = {}) {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await target.boundingBox();
  if (!box) throw new Error('nothing to click');
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // About 0.6 s of motion, eased, one small move per frame, so the glide is smooth at 60 fps.
  const from = mouse;
  for (let i = 1; i <= 36; i++) {
    const k = i / 36;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await page.waitForTimeout(16);
  }
  mouse = to;
  await page.waitForTimeout(250);
  if (click) await page.mouse.down(), await page.waitForTimeout(90), await page.mouse.up();
}

/** Record one scene: every frame Chrome paints, with its timestamp, then a 60 fps 4K MP4. */
async function scene(name, fn, existing, keep = false) {
  if (only.length && !only.includes(name)) return;
  const dir = join(OUT, `${name}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = existing ?? (await context.newPage());
  if (process.argv.includes('--debug')) {
    page.on('console', (m) => console.log('page>', m.type(), m.text().slice(0, 200)));
    page.on('pageerror', (e) => console.log('pageerror>', String(e.stack ?? e).slice(0, 600)));
    for (const sw of context.serviceWorkers()) sw.on('console', (m) => console.log('sw>', m.type(), m.text().slice(0, 200)));
  }
  await page.mouse.move(mouse.x, mouse.y);
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
  try {
    await fn(page);
    await page.waitForTimeout(1500);
  } finally {
    // Chrome sends a frame only when something changes, so the last one lasts until recording stops.
    var endT = Date.now() / 1000;
    await cdp.send('Page.stopScreencast').catch(() => undefined);
    if (!existing && !keep) await page.close();
  }
  if (frames.length < 2) throw new Error(`${name}: no frames`);
  // Each frame lasts until the next one; the last holds for a second.
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? endT) - f.t).toFixed(4)}`).join('\n');
  writeFileSync(join(dir, 'list.txt'), `${list}\nfile '${frames.at(-1).file.replace(/\\/g, '/')}'\n`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
    '-vf', 'scale=3840:2160:flags=lanczos,fps=60', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    join(OUT, `${name}.mp4`)], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${name}: ffmpeg failed`);
  rmSync(dir, { recursive: true, force: true });
  console.log(`  ok    ${name}: ${frames.length} frames, ${(endT - frames[0].t).toFixed(1)} s`);
}

try {
  let id;
  if (FAMILY) {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
    id = new URL(worker.url()).host;
  } else {
    const cdp = await context.browser().newBrowserCDPSession();
    ({ id } = await cdp.send('Extensions.loadUnpacked', { path: EXT }));
  }
  const ext = (path) => `chrome-extension://${id}/${path}`;
  // Wait for Gemini Nano to be ready inside the extension before filming.
  const checks = await context.newPage();
  await checks.goto(ext('checks.html'));
  if (!FAMILY) {
  const status = checks.locator('section.tw-card', { has: checks.getByRole('heading', { name: 'Status' }) });
  for (let i = 0; i < 20; i++) {
    await checks.getByRole('button', { name: 'Refresh status' }).click();
    await status.locator('pre').waitFor({ timeout: 20_000 });
    if (/"onDevice":\s*"available"/.test(await status.locator('pre').last().innerText())) break;
    await checks.waitForTimeout(3000);
  }
  }
  await checks.close();
  const ui = (page) => page.locator('tripwire-ui');
  const env = readFileSync('.env', 'utf8');
  const DASHBOARD = (/^WXT_DASHBOARD_URL=(.+)$/m.exec(env)?.[1] ?? '').trim();
  const TOKEN = (/^WXT_APPCHECK_DEBUG_TOKEN=(.+)$/m.exec(env)?.[1] ?? '').trim();

  /** A full-screen text card, recorded like any other scene. */
  const card = (name, lines, ms) =>
    FAMILY ? Promise.resolve() : scene(name, async (page) => {
      const html = lines.map(([size, text, color]) => `<p style="font-size:${size}px;color:${color ?? '#f3f6fc'};margin:0 0 ${size * 0.6}px">${text}</p>`).join('');
      await page.setContent(`<html><body style="margin:0;height:100vh;display:flex;align-items:center;background:#15315f;font-family:'Segoe UI',system-ui,sans-serif;font-weight:600"><div style="padding:0 120px;max-width:1000px;opacity:0;transition:opacity .6s" id="c">${html}</div></body></html>`);
      await page.waitForTimeout(100);
      await page.evaluate(() => { document.getElementById('c').style.opacity = '1'; });
      await page.waitForTimeout(ms);
    });

  // Pair a family member first (no pairing code is shown within an hour of a warning). Not filmed.
  let family;
  if (FAMILY) {
  const setup = await context.newPage();
  await setup.goto(ext('onboarding.html'));
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('button', { name: 'Show a pairing code' }).click();
  await setup.locator('.tw-code').waitFor({ timeout: 30_000 });
  const code = (await setup.locator('.tw-code').innerText()).replace(/\D/g, '');
  family = await context.newPage();
  await family.addInitScript((t) => { if (location.protocol.startsWith('http')) self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, TOKEN);
  await family.goto(DASHBOARD);
  // This profile is kept between runs: start the family page signed out, as a new visitor.
  await family.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name);
  });
  await family.reload();
  await family.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 60_000 });
  await family.getByLabel('Eight-digit pairing code').fill(code);
  await family.getByLabel('What should we call them?').fill('Mom');
  await family.getByLabel('Your first name').fill('Sam');
  await family.getByRole('button', { name: 'Connect' }).click();
  await setup.getByRole('button', { name: 'Yes, allow' }).click({ timeout: 30_000 });
  await setup.getByText('A family member is connected.').waitFor({ timeout: 30_000 });
  // Real Chrome slows background tabs; bring the family page forward and load it fresh.
  await family.bringToFront();
  await family.reload();
  try {
    await family.getByRole('heading', { name: 'All quiet' }).waitFor({ timeout: 45_000 });
  } catch (err) {
    console.log('family page:', (await family.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400));
    console.log('setup page:', (await setup.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300));
    throw err;
  }
  await setup.close();
  console.log('  ok    family paired');

  }
  await card('00-hook', [[64, 'Your mom gets a call.'], [44, '“Your bank account has been hacked. Move your savings to a safe account. Don’t tell anyone.”', '#c9d6ee']], 7000);
  await card('01-problem', [[56, 'Scams like this cost older Americans billions every year.'], [40, 'Tripwire steps in at the moment the money would leave.', '#c9d6ee']], 5500);

  if (!FAMILY) await scene('02-scam-message', async (page) => {
    await page.goto('http://localhost:4174/bank.html');
    await page.waitForTimeout(1200);
    await ui(page).locator('.tw-banner, .tw-overlay').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);
    const why = ui(page).getByRole('button', { name: /^Why/ }).first();
    if (await why.count()) { await clickOn(page, why); await page.waitForTimeout(4500); }
    await clickOn(page, ui(page).getByRole('button', { name: 'Stop and stay safe' }));
    await page.waitForURL(/safe\.html/, { timeout: 15_000 });
    await page.waitForTimeout(3500);
  });

  if (!FAMILY) await scene('03-ordinary-checkout', async (page) => {
    await page.goto('http://localhost:4174/shop.html');
    await page.waitForTimeout(1200);
    await clickOn(page, page.locator('#cc'));
    await page.keyboard.type('4111 1111 1111 1111', { delay: 70 });
    await page.waitForTimeout(3000);
  });

  if (!FAMILY) await scene('04-tech-support-call', async (page) => {
    await page.goto('http://localhost:4174/support.html');
    await page.waitForTimeout(1500);
    const pause = ui(page).locator('.tw-overlay');
    if (!(await pause.count())) await clickOn(page, page.getByRole('link', { name: 'Call support now' }));
    await pause.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(6000);
  });

  if (!FAMILY) await scene('05-gift-card-code', async (page) => {
    await page.goto('http://localhost:4174/giftcard.html');
    await page.waitForTimeout(1500);
    const pause = ui(page).locator('.tw-overlay');
    if (!(await pause.count())) await clickOn(page, page.locator('input').first());
    await pause.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(5500);
  });

  if (!FAMILY) await scene('06-crypto-wallet', async (page) => {
    await page.goto('http://localhost:4174/crypto.html');
    await page.waitForTimeout(1500);
    const pause = ui(page).locator('.tw-overlay');
    if (!(await pause.count())) await clickOn(page, page.locator('input').first());
    await pause.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(5000);
  });

  if (!FAMILY) await scene('07-gift-card-cart', async (page) => {
    await page.goto('http://localhost:4174/giftcards.html');
    await page.waitForTimeout(1500);
    await clickOn(page, page.locator('#cc'));
    await ui(page).getByText('Is someone on the phone telling you to buy these gift cards?').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(5500);
  });

  let bank;
  if (FAMILY) await scene('08-bank-transfer', async (page) => {
    bank = page;
    await page.goto('http://localhost:4174/transfer.html');
    await page.waitForTimeout(1500);
    await clickOn(page, page.locator('#amount'));
    await ui(page).getByText('Is someone on the phone telling you to move money?').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(5000);
  }, undefined, true);
  if (FAMILY) {
  // A stop on the fake bank page, so the family page has an alert to show. Not filmed.
    const pre = await context.newPage();
    await pre.goto('http://localhost:4174/bank.html');
    await ui(pre).locator('.tw-banner, .tw-overlay').first().waitFor({ timeout: 60_000 });
    if ((await ui(pre).locator('.tw-overlay').count()) === 0) await pre.locator('#cc').focus();
    await ui(pre).getByRole('button', { name: 'Stop and stay safe' }).click();
    await pre.waitForURL(/safe\.html/, { timeout: 15_000 });
    await pre.close();
  }
  if (FAMILY) await scene('09-family-answers', async (page) => {
    await page.bringToFront();
    await page.reload();
    await page.getByRole('heading', { name: 'Tripwire is holding something right now' }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3500);
    await clickOn(page, page.getByRole('button', { name: 'Keep it on hold for 30 minutes' }));
    await page.getByText('You asked them to wait 30 more minutes').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 450);
    await page.waitForTimeout(3500);
  }, family);
  if (FAMILY) await scene('09b-pause-updates', async (page) => {
    await page.bringToFront();
    await ui(page).getByText('Your family asked you to wait').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4500);
  }, bank);

  if (!FAMILY) await scene('10-call-check', async (page) => {
    await page.goto(ext('call.html'));
    await page.waitForTimeout(1500);
    for (const choice of ['My bank', 'Read them a code from my phone', 'Telling me to keep it secret', 'Rushing me or threatening']) {
      await clickOn(page, page.getByRole('button', { name: choice }));
      await page.waitForTimeout(500);
    }
    await clickOn(page, page.getByRole('button', { name: 'Check this call' }));
    await page.locator('section[aria-live] .tw-route, p[role=alert]').first().waitFor({ timeout: 90_000 });
    await page.waitForTimeout(4000);
    const sent = page.getByRole('button', { name: 'See exactly what was sent' }).first();
    if (await sent.count()) {
      await clickOn(page, sent);
      await page.waitForTimeout(1200);
      await sent.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(6000);
    }
  });

  if (OFFLINE) await scene('13-offline', async (page) => {
    await page.goto('http://localhost:4174/refund.html');
    await page.waitForTimeout(1500);
    await ui(page).locator('.tw-banner, .tw-overlay').first().waitFor({ timeout: 90_000 });
    await page.waitForTimeout(5500);
  });

  await card('11-hybrid', [[52, 'Gemini Nano decides on your computer.'], [40, 'Only when it is unsure does a redacted copy go to the cloud, and Tripwire shows exactly what was sent.', '#c9d6ee'], [34, 'Same 25 of 25 scams caught, with 3,664 bytes sent instead of 22,018: 83% less', '#f3f6fc'], [30, 'Firebase AI Logic hybrid inference · App Check · Remote Config', '#9fb3d9']], 8000);
  await card('12-close', [[72, 'Tripwire'], [40, 'Free and open source · English, Spanish and French · for Chrome', '#c9d6ee'], [32, 'github.com/cryptrix1598/tripwire', '#9fb3d9']], 6000);
} finally {
  await context.close();
  await server.close();
}
