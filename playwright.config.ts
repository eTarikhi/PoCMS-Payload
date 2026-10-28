import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

/**
 * End-to-End & Accessibility test configuration (Playwright + @axe-core/playwright).
 * Override target host via `PLAYWRIGHT_BASE_URL` when running against a preview deployment.
 */
export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
