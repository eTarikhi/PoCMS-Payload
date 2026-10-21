import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../..',
  testMatch: ['**/tests/e2e/frontend.e2e.spec.ts', '**/previews/studio/tests/*.e2e.spec.ts'],
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: [
            '--no-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        }
      : {},
  },
  webServer: {
    command: 'corepack pnpm preview:studio',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
