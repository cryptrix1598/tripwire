// Chrome Web Store images: the 440x280 small promo tile, the 1400x560 marquee, and five
// 1280x800 screenshots picked from docs/screenshots. Writes store/.
//   node scripts/make-store-assets.mjs
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

mkdirSync('store', { recursive: true });
const font = readFileSync('public/fonts/atkinson-700.woff2').toString('base64');
const mark = `<svg width="64" height="40" viewBox="0 0 32 20" aria-hidden="true"><path d="M2 2v16M30 2v16M2 10h28" stroke="#4F7FE8" stroke-width="3.2" stroke-linecap="round" fill="none"/></svg>`;
const tile = (w, h, title, sub) => `<!doctype html><html><head><style>
@font-face{font-family:A;src:url(data:font/woff2;base64,${font})}
*{margin:0;box-sizing:border-box}body{width:${w}px;height:${h}px;background:#15335f;color:#f5f8fd;font-family:A,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(w * 0.08)}px;gap:${Math.round(h * 0.06)}px}
.b{display:flex;align-items:center;gap:16px;font-size:${Math.round(h * 0.1)}px}h1{font-size:${Math.round(Math.min(h * 0.15, w * 0.075))}px;line-height:1.05}p{font-size:${Math.round(h * 0.075)}px;color:#d3def0;line-height:1.3}
</style></head><body><div class="b">${mark}<span>Tripwire</span></div><h1>${title}</h1><p>${sub}</p></body></html>`;

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage();
for (const [name, w, h, title, sub] of [
  ['promo-small-440x280', 440, 280, 'A calm second look<br>before you pay', 'Checked privately on your computer.'],
  ['promo-marquee-1400x560', 1400, 560, 'A calm second look before you pay', 'Tripwire steps in at the moment a scam asks for money, and checks privately on your own computer first.'],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(tile(w, h, title, sub));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `store/${name}.png` });
}
await browser.close();

const shots = ['on-device-pause', 'call-check-on-device', 'pause-transfer', 'family-live', 'settings'];
shots.forEach((s, i) => copyFileSync(`docs/screenshots/${s}.png`, `store/screenshot-${i + 1}-${s}.png`));
copyFileSync('public/icon/128.png', 'store/icon-128.png');
console.log('store/: icon, 2 promo images, 5 screenshots');
