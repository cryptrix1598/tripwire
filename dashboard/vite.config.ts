import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The family dashboard: a small web app that shares its copy, tokens and
// components with the extension (../src/ui) and reads the same .env file.
export default defineConfig({
  root: at('.'),
  envDir: at('..'),
  envPrefix: ['WXT_'],
  publicDir: at('../public'),
  css: { postcss: { plugins: [] } },
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  build: { outDir: at('./dist'), emptyOutDir: true },
});
