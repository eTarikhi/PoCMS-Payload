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

## After P5 (2026-10-16, same setup)

| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |
|---|---|---|---|---|---|---|
| `/admin/login` | 15 | 666.2 | 2247.2 | 5 | 58.6 | 409.5 |
| `/admin` | 15 | 666.2 | 2247.2 | 5 | 58.6 | 409.5 |
| `/admin/collections/articles` | 17 | 676.4 | 2279.6 | 5 | 58.6 | 409.5 |
| `/admin/collections/articles/create` | 16 | 666.5 | 2247.4 | 5 | 58.6 | 409.5 |

| | JS kB (compressed) on `/admin` | CSS kB (compressed) |
|---|---|---|
| P0 baseline | 645.2 | 45.2 |
| After P5 | 666.2 (**+21.0**, budget +60) | 58.6 (**+13.4**, budget +25) |
| After the admin shell (`76c2e02`) | 666.4 (**+21.2**, budget +60) | 61.2 (**+16.0**, budget +25) |

## After the admin shell (2026-10-16, `76c2e02`, same setup)

Sidebar icons and icon rail, header theme switch, cache refresh, list summaries, 14px body text and
article Live Preview.

| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |
|---|---|---|---|---|---|---|
| `/admin/login` | 12 | 666.4 | 2250.9 | 7 | 61.2 | 423.3 |
| `/admin` | 12 | 666.4 | 2250.9 | 7 | 61.2 | 423.3 |
| `/admin/collections/articles` | 14 | 676.6 | 2283.2 | 7 | 61.2 | 423.3 |
| `/admin/collections/articles/create` | 13 | 666.6 | 2251.1 | 7 | 61.2 | 423.3 |

- JS: +0.2 kB. The new client pieces are small and reuse what the admin already loads
  (`buttonVariants`, Payload's `toast` and `useTheme`); the list summary is a server component.
- CSS: +2.6 kB, mostly the 14 generated icon masks (data-URI SVGs) and the rail styles.
- Public article page: none of its initial chunks contain Live Preview code. The live renderer
  (2.1 kB compressed) loads only when the page runs inside a frame.

Both budgets hold. List pages load the TanStack Table chunk on top (+10.2 kB, `/admin/collections/*`).

The first measurement after P5 was over budget (`/admin` 899.5 kB, +254 kB): Payload's admin is a
single route, so every client component reachable from the import map ships to every admin page.
What brought it back:

- the dashboard chart is server-rendered HTML instead of Recharts (about -107 kB on `/admin`);
- the UI kit (`UIKitLazy`), TanStack Table (`LazyDataTable`) and Font Awesome (`ServiceIconField`,
  `IconCell`) load through `next/dynamic` wrappers, only where they render;
- the sidebar Create control is a native disclosure (`details`/`summary`) with links, not a menu
  library; the account avatar is plain markup; the tooltip provider moved into the UI kit;
- dashboard link-buttons use `buttonVariants` on links instead of the Base UI Button component.

Rule for new admin components: anything heavy that is not needed on every admin page goes behind a
small `'use client'` wrapper that calls `next/dynamic`, and that wrapper is what the config
references.

