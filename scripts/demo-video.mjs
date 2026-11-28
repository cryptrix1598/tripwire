// Records the demo scenes in Chrome with Gemini Nano, headless, at 3840x2160, then builds each scene
// as a constant 60 fps 4K MP4 with ffmpeg. Usage: npm run build && node scripts/demo-video.mjs
// Output: video/raw/<scene>.mp4 (frames are kept only until each scene is encoded).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const context = await chromium.launchPersistentContext(resolve('.nano-profile'), {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 3,
  ignoreDefaultArgs: ['--disable-background-networking', '--disable-component-update', `--disable-features=${playwrightDisabled.join(',')}`, '--disable-extensions'],
  args: [
    `--disable-features=${playwrightDisabled.filter((f) => f !== 'OptimizationHints').join(',')}`,
    '--enable-features=AIPromptAPI,OptimizationGuideOnDeviceModel',
    '--enable-unsafe-extension-debugging',
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
async function scene(name, fn) {
  if (only.length && !only.includes(name)) return;
  const dir = join(OUT, `${name}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await context.newPage();
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
    await page.close();
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
  const browser = context.browser();
  const cdp = await browser.newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const ext = (path) => `chrome-extension://${id}/${path}`;
  // Wait for Gemini Nano to be ready inside the extension before filming.
  const checks = await context.newPage();
  await checks.goto(ext('checks.html'));
  const status = checks.locator('section.tw-card', { has: checks.getByRole('heading', { name: 'Status' }) });
  for (let i = 0; i < 20; i++) {
    await checks.getByRole('button', { name: 'Refresh status' }).click();
    await status.locator('pre').waitFor({ timeout: 20_000 });
    if (/"onDevice":\s*"available"/.test(await status.locator('pre').last().innerText())) break;
    await checks.waitForTimeout(3000);
  }
  await checks.close();
  const ui = (page) => page.locator('tripwire-ui');

  // 1. A fake bank message: Nano reads it on the computer and pauses the page.
  await scene('1-scam-message', async (page) => {
    await page.goto('http://localhost:4174/bank.html');
    await page.waitForTimeout(1200);
    await ui(page).locator('.tw-banner, .tw-overlay').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3500);
    const why = ui(page).getByRole('button', { name: /^Why/ }).first();
    if (await why.count()) { await clickOn(page, why); await page.waitForTimeout(3500); }
    await clickOn(page, ui(page).getByRole('button', { name: 'Stop and stay safe' }));
    await page.waitForURL(/safe\.html/, { timeout: 15_000 });
    await page.waitForTimeout(3500);
  });

  // 2. An ordinary checkout: typing a card number, nothing appears.
  await scene('2-ordinary-checkout', async (page) => {
    await page.goto('http://localhost:4174/shop.html');
    await page.waitForTimeout(1500);
    await clickOn(page, page.locator('#cc'));
    await page.keyboard.type('4111 1111 1111 1111', { delay: 90 });
    await page.waitForTimeout(4000);
  });

  // 3. Their own bank, a new payee: the money question and the five-minute hold.
  await scene('3-bank-transfer', async (page) => {
    await page.goto('http://localhost:4174/transfer.html');
    await page.waitForTimeout(2000);
    await clickOn(page, page.locator('#amount'));
    if (!(await page.locator('#amount').evaluate((el) => el === document.activeElement))) await page.locator('#amount').focus();
    if (process.argv.includes('--debug')) {
      await page.waitForTimeout(8000);
      const sw = context.serviceWorkers()[0];
      console.log('ui nodes', await ui(page).evaluate((h) => (h.shadowRoot ? h.shadowRoot.innerHTML.length : -1)).catch((e) => String(e).slice(0, 80)));
      console.log('local', JSON.stringify(await sw?.evaluate(async () => Object.keys(await chrome.storage.local.get(null)))));
      console.log('session', JSON.stringify(await sw?.evaluate(async () => await chrome.storage.session.get(null))).slice(0, 600));
    }
    await ui(page).getByText('Is someone on the phone telling you to move money?').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(6000);
  });

  // 4. Gift cards at a real store: the gift-card question and the hold.
  await scene('4-gift-cards', async (page) => {
    await page.goto('http://localhost:4174/giftcards.html');
    await page.waitForTimeout(2000);
    await clickOn(page, page.locator('#cc'));
    await ui(page).getByText('Is someone on the phone telling you to buy these gift cards?').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(6000);
  });
} finally {
  await context.close();
  await server.close();
}
