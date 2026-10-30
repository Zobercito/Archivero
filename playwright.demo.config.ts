import { defineConfig, devices } from '@playwright/test';

const webPort = 5274;
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'demo.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run --cwd apps/web dev:demo',
    url: baseURL,
    env: { WEB_PORT: String(webPort) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
