import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
