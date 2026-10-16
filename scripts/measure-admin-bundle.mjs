#!/usr/bin/env node
/**
 * Measures what the admin panel ships to the browser: JS and CSS bytes (compressed, as transferred,
 * and decoded) for a few key admin routes. Run it against a production server (`pnpm build && pnpm
 * start`), never against `next dev`.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/measure-admin-bundle.mjs [baseURL]
 *
 * Output: a Markdown table on stdout. Used for the P0 baseline and the budget checks in later phases
 * (docs/ui-modernization/perf-budget.md).
 */
import { chromium } from '@playwright/test'

const baseURL = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD')
  process.exit(1)
}

const routes = ['/admin/login', '/admin', '/admin/collections/articles', '/admin/collections/articles/create']

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox'],
})
const context = await browser.newContext()
const page = await context.newPage()

const kb = (n) => (n / 1024).toFixed(1)
const rows = []

for (const route of routes) {
  if (route !== '/admin/login' && !(await context.cookies()).some((c) => c.name === 'payload-token')) {
    const res = await page.request.post(`${baseURL}/api/users/login`, { data: { email, password } })
    if (!res.ok()) throw new Error(`Login failed: ${res.status()}`)
  }
  await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' })
  const totals = await page.evaluate(() => {
    const t = { js: { transfer: 0, decoded: 0, count: 0 }, css: { transfer: 0, decoded: 0, count: 0 } }
    for (const e of performance.getEntriesByType('resource')) {
      const type = e.name.split('?')[0].endsWith('.css') || e.initiatorType === 'link' && e.name.includes('.css') ? 'css' : e.name.split('?')[0].endsWith('.js') ? 'js' : null
      if (!type) continue
      t[type].transfer += e.encodedBodySize
      t[type].decoded += e.decodedBodySize
      t[type].count += 1
    }
    return t
  })
  rows.push(
    `| \`${route}\` | ${totals.js.count} | ${kb(totals.js.transfer)} | ${kb(totals.js.decoded)} | ${totals.css.count} | ${kb(totals.css.transfer)} | ${kb(totals.css.decoded)} |`,
  )
}

await browser.close()

console.log('| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |')
console.log('|---|---|---|---|---|---|---|')
for (const row of rows) console.log(row)
