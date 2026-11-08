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
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173',
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
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        PORT: '4000',
        DATABASE_URL:
          process.env.DATABASE_URL ||
          'postgresql://postgres:sai09072006@localhost:5432/eventora_venue_test?sslmode=disable',
        START_SERVER: 'true',
        PUBLIC_WEB_URL: 'http://localhost:5173',
        PUBLIC_API_URL: 'http://localhost:4000',
      },
    },
    {
      command: 'pnpm --filter web dev --port 5173 --mode test',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        PORT: '5173',
        VITE_API_URL: 'http://localhost:4000',
      },
    },
  ],
});
