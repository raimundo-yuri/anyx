import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base, testDir: './tests/cloud', outputDir: 'test-results-cloud',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4186' },
  webServer: { command: 'npm run test:cloud:server', url: 'http://127.0.0.1:4186', reuseExistingServer: false },
});
