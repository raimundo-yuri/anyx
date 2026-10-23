import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';
export default defineConfig({
  ...base, testDir: './tests/production', outputDir: 'test-results-production',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
});
