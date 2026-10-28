import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Signs in to the Payload Admin Panel via `/admin/login` and waits for the governed sidebar.
 */
export async function login({
  page,
  serverURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  const base = serverURL.replace(/\/+$/, '')
  await page.goto(`${base}/admin/login`)

  await page.fill('#field-email', user.email)
  await page.fill('#field-password', user.password)
  await page.click('button[type="submit"]')

  await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.endsWith('/login'))

  await expect(page.locator('#nav-articles')).toBeVisible()
}
