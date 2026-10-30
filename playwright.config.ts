import { defineConfig, devices } from '@playwright/test';

const apiPort = 3101;
const webPort = 5273;
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'demo.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bun run --cwd apps/api start',
      url: `http://localhost:${apiPort}/api/health`,
      env: {
        NODE_ENV: 'test',
        PORT: String(apiPort),
        APP_ORIGIN: baseURL,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'bun run --cwd apps/web dev',
      url: baseURL,
      env: {
        WEB_PORT: String(webPort),
        API_PROXY_TARGET: `http://localhost:${apiPort}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
