# Admin performance baseline and budget

Measured with `scripts/measure-admin-bundle.mjs` against a production build (`pnpm build && pnpm
start`), Chromium, logged in as an admin. "Compressed" is what the browser downloads (gzip from
`next start`); "decoded" is the size after decompression.

## P0 baseline (2026-10-16, Payload 3.90.2, Next.js 16.3.8, before any admin UI change)

| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |
|---|---|---|---|---|---|---|
| `/admin/login` | 11 | 645.2 | 2184.3 | 4 | 45.2 | 317.5 |
| `/admin` | 11 | 645.2 | 2184.3 | 4 | 45.2 | 317.5 |
| `/admin/collections/articles` | 11 | 645.2 | 2184.3 | 4 | 45.2 | 317.5 |
| `/admin/collections/articles/create` | 12 | 645.4 | 2184.5 | 4 | 45.2 | 317.5 |

## Budget

- Admin JS: at most **+60 kB compressed** over the baseline on `/admin` after the dashboard (P4).
- Admin CSS: at most **+25 kB compressed** (Tailwind utilities are generated only for the scanned
  admin components, and Preflight is not included).
- Charts (Recharts) load only in the dashboard's chart island.
