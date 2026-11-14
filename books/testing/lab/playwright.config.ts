import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8080', trace: 'on-first-retry' },
  webServer: {
    command: 'node src/server.ts',
    url: 'http://127.0.0.1:8080/',
    env: { API_TOKEN: 'dev-token', PORT: '8080' },
    reuseExistingServer: false,
  },
});
