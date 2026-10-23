import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { localPwa } from './build/pwa.ts';
import { defaultAppName } from './src/config/identity.ts';

export default defineConfig(({ mode }) => ({
  plugins: [react(), localPwa(loadEnv(mode, process.cwd()).VITE_APP_NAME?.trim() || defaultAppName)],
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] } } } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
}));
