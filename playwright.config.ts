import { defineConfig, devices } from '@playwright/test';
import { E2E_SITE_PASSWORD } from './tests/e2e/site-password';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Runs against the local Supabase stack: start it with `supabase start` first.
 * Playwright boots the Next.js dev server itself.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // Pinned so the time-zone defaulting is deterministic to assert on.
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // A throwaway password for the site gate, so the real one never appears in
    // the repo. A real environment variable beats .env.local in Next.js.
    env: { SITE_PASSWORD: E2E_SITE_PASSWORD },
  },
});
