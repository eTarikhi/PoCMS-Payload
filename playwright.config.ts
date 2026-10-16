import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * - `tests/e2e`: functional tests (`pnpm test:e2e`).
 * - `tests/visual`: screenshot and accessibility suites (`pnpm test:visual`).
 *
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE lets environments without Playwright's own browser download use a
 * preinstalled Chromium.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.e2e.spec.ts', 'visual/**/*.visual.spec.ts'],
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
          : { channel: 'chromium' }),
      },
    },
  ],
  webServer: {
    // CI runs against the production build (`pnpm build` first); locally the dev server is reused.
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    reuseExistingServer: !process.env.CI,
    url: baseURL,
    timeout: 180_000,
  },
})
