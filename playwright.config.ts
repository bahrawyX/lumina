import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.test if present (local test-account credentials etc.)
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Specs that must run SIGNED OUT.
 *
 * Splitting them into their own project rather than clearing `storageState`
 * inside a fixture, because this has to be impossible to forget: a public spec
 * that silently inherits the session does not error — it quietly tests the
 * wrong thing. `/` redirects an authenticated visitor to `/calendar`, so a
 * "renders the marketing hero" assertion fails for a reason that has nothing to
 * do with the hero.
 */
const PUBLIC_SPECS = ['**/auth.spec.ts', '**/landing.spec.ts', '**/onboarding.spec.ts'];

export default defineConfig({
  testDir: './tests/e2e',
  // Signs a disposable test account in once and writes its session to
  // `STORAGE_STATE`, which every project below then loads. The suite used to
  // fake guest mode in localStorage instead; that stopped working when route
  // protection moved into `proxy.ts`. See `global-setup.ts`.
  globalSetup: './tests/e2e/global-setup.ts',
  testIgnore: ['**/tests/e2e/visual/**/*.d.ts'],
  // Unit tests (Vitest) live alongside components — keep e2e isolated.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI
    ? [['html', { open: 'never', outputFolder: 'playwright-report' }], ['github']]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',

  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
  },



  projects: [
    {
      name: 'chromium-public',
      testMatch: PUBLIC_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: undefined,
      },
    },
    {
      name: 'chromium-desktop',
      testIgnore: PUBLIC_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // The session established by global setup. Without it every `(app)`
        // route answers 307 to /auth/signin.
        storageState: 'tests/e2e/.auth/user.json',
      },
      // Skip mobile-only specs. Tests tagged @mobile are mobile-only; tests
      // tagged @cross (with or without @mobile) still run on desktop.
      grepInvert: /@mobile\b(?!.*@cross)/,
    },
    {
      name: 'chromium-mobile',
      testIgnore: PUBLIC_SPECS,
      use: { ...devices['Pixel 5'], storageState: 'tests/e2e/.auth/user.json' },
      // Mobile-specific layout sanity checks only — we tag tests with @mobile to include here.
      grep: /@mobile|@cross/,
    },
  ],

  // Reuse the dev server the developer already has running; otherwise start it.
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
