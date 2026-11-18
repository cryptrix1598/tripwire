import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The family dashboard: a small web app that shares its copy, tokens and
// components with the extension (../src/ui) and reads the same .env file.
//
// The dashboard is hosted publicly, so only the public Firebase web config is
// exposed to it. The App Check debug token is deliberately NOT in `envPrefix`;
// it is injected only into the local dev server, never into a build.
//
// It also builds /try.js, which runs the extension's content script on the
// hosted practice pages so they can be tried without installing anything.
export default defineConfig(({ command, mode }) => {
  const debugToken = command === 'serve' ? (loadEnv(mode, at('..'), 'WXT_APPCHECK_').WXT_APPCHECK_DEBUG_TOKEN ?? '') : '';
  return {
    root: at('.'),
    envDir: at('..'),
    envPrefix: ['WXT_FIREBASE_', 'WXT_DASHBOARD_', 'WXT_RECAPTCHA_', 'WXT_DEMO_', 'WXT_EXTENSION_'],
    define: { __APPCHECK_DEBUG_TOKEN__: JSON.stringify(debugToken) },
    publicDir: at('../public'),
    css: { postcss: { plugins: [] } },
    plugins: [react()],
    // The content script imports WXT helpers from "#imports"; on the web they are small stand-ins.
    resolve: { alias: { '#imports': at('./src/wxtShim.tsx') } },
    server: { port: 5174, strictPort: true },
    build: {
      outDir: at('./dist'),
      emptyOutDir: true,
      rolldownOptions: {
        input: { main: at('./index.html'), stopped: at('./stopped.html'), attest: at('./attest.html'), privacy: at('./privacy.html'), try: at('./src/demoRuntime.tsx') },
        output: {
          // A fixed name, because the static practice pages link to it.
          entryFileNames: (chunk) => (chunk.name === 'try' ? 'try.js' : 'assets/[name]-[hash].js'),
        },
      },
    },
  };
});
