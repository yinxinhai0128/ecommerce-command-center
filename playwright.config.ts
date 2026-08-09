import { defineConfig, devices } from '@playwright/test';

const pilotDataDir = 'test-results/olist-e2e-data';
const serverEnv = { ...process.env, PORT: '8788', OLIST_DATA_DIR: pilotDataDir, DEEPSEEK_API_KEY: '' };
const viteEnv = { ...process.env, PORT: '8788', DEEPSEEK_API_KEY: '' };

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
      command: 'node --env-file-if-exists=.env --import tsx server/index.ts',
      env: serverEnv,
      url: 'http://127.0.0.1:8788/api/pilot/status',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5174',
      env: viteEnv,
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
