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
export default defineConfig(({ command, mode }) => {
  const debugToken = command === 'serve' ? (loadEnv(mode, at('..'), 'WXT_APPCHECK_').WXT_APPCHECK_DEBUG_TOKEN ?? '') : '';
  return {
    root: at('.'),
    envDir: at('..'),
    envPrefix: ['WXT_FIREBASE_', 'WXT_DASHBOARD_', 'WXT_RECAPTCHA_', 'WXT_DEMO_'],
    define: { __APPCHECK_DEBUG_TOKEN__: JSON.stringify(debugToken) },
    publicDir: at('../public'),
    css: { postcss: { plugins: [] } },
    plugins: [react()],
    server: { port: 5174, strictPort: true },
    build: { outDir: at('./dist'), emptyOutDir: true },
  };
});
