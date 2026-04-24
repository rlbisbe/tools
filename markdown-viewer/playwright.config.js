import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // baseURL is not set globally — each fixture starts its own server
  use: {
    browserName: 'chromium',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
});
