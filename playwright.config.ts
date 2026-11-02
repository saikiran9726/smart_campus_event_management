import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      'cf-turnstile-response': 'test-pass',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter api dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        START_SERVER: 'true',
        PUBLIC_WEB_URL: 'http://localhost:3000',
        PUBLIC_API_URL: 'http://localhost:3001',
      },
    },
    {
      command: 'pnpm --filter web dev --port 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        VITE_API_URL: 'http://localhost:3001',
      },
    },
  ],
});
