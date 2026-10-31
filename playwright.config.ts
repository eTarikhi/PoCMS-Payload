import { chromium, defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

import { resolvePlaywrightBrowserUse } from './tests/helpers/playwrightBrowser'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const browserUse = resolvePlaywrightBrowserUse({
  bundledChromiumExecutablePath: chromium.executablePath(),
})

/**
 * End-to-End & Accessibility test configuration (Playwright + @axe-core/playwright).
 * Uses Playwright's bundled Chromium when installed, and automatically falls back to a locally
 * installed Chrome / Microsoft Edge / Chromium binary when `cdn.playwright.dev` is unreachable.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...browserUse,
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: !process.env.CI,
    url: baseURL,
    timeout: 120_000,
    env: {
      ...(process.env as Record<string, string>),
      PAYLOAD_SECRET:
        process.env.PAYLOAD_SECRET || 'playwright-e2e-dev-secret-key-min-32-chars',
    },
  },
})
