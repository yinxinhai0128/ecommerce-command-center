import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'cmd /c "set PORT=8788&& node --env-file-if-exists=.env --import tsx server/index.ts"',
      url: 'http://127.0.0.1:8788/api/pilot/status',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'cmd /c "set PORT=8788&& pnpm exec vite --host 127.0.0.1 --port 5174"',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
