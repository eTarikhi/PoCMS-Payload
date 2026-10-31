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
 * Uses generous timeouts so cold on-demand Next.js dev compilation of `/admin` on Windows
 * completes before form interaction.
 */
export async function login({
  page,
  serverURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  const base = serverURL.replace(/\/+$/, '')
  await page.goto(`${base}/admin/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })

  const emailField = page.locator('#field-email')
  await expect(emailField).toBeVisible({ timeout: 120_000 })
  await emailField.fill(user.email)

  await page.locator('#field-password').fill(user.password)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL(
    (url) => url.pathname.startsWith('/admin') && !url.pathname.endsWith('/login'),
    { timeout: 60_000 },
  )

  await expect(page.locator('#nav-articles')).toBeVisible({ timeout: 60_000 })
}
