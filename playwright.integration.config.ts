import { defineConfig, devices } from '@playwright/test'
import { assertIntegrationEnvironment } from './scripts/integration/safety'

assertIntegrationEnvironment()
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
  throw new Error('Integration browser tests require a loopback application URL.')
export default defineConfig({
  testDir: './tests/live',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
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
})
