import { readFileSync } from 'node:fs';
import { defineConfig } from 'wxt';

// A fixed public key gives the extension the same ID everywhere it is loaded unpacked, so the
// hosted App Check page can answer this extension and no other (see dashboard/src/attest.ts).
const { key } = JSON.parse(readFileSync('src/config/extensionKey.json', 'utf8')) as { key: string };

// Tripwire: Manifest V3 Chrome extension, built with WXT.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Inline (empty) PostCSS config so a stray config above this folder is never picked up.
  vite: () => ({ css: { postcss: { plugins: [] } } }),
  manifest: {
    name: 'Tripwire: a calm second look before you act',
    short_name: 'Tripwire',
    description:
      'Steps in at the exact moment you are about to fall for a scam. Checks pages privately on your own computer first.',
    minimum_chrome_version: '116',
    key,
    permissions: ['storage', 'offscreen', 'downloads', 'activeTab'],
    action: {
      default_title: 'Tripwire',
    },
    // The in-page banner registers Tripwire's bundled font on the host document.
    web_accessible_resources: [{ resources: ['fonts/*'], matches: ['http://*/*', 'https://*/*'] }],
  },
});
