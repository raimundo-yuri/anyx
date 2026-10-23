import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

export default defineConfig({
  ...base, testDir: './tests/pages', outputDir: 'test-results-pages',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175/anyx/' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --outDir dist-pages --base /anyx/',
    url: 'http://127.0.0.1:4175/anyx/', reuseExistingServer: false,
  },
});
