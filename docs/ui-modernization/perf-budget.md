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

Raised on 2026-10-17 (was +60 kB JS / +25 kB CSS) to make room for the frontier features: the
command menu, motion and richer interactive views.

- Admin JS: at most **+150 kB compressed** over the P0 baseline on `/admin` (645.2 kB, so at most
  about 795 kB).
- Admin CSS: at most **+40 kB compressed** (45.2 kB, so at most about 85 kB). Tailwind utilities are
  generated only for the scanned admin components, and Preflight is not included.
- The rule stays: a feature that isn't needed on every page loads on demand (`next/dynamic`, a
  dynamic `import()` on first use, or a server component). The command menu, the TanStack table,
  the publishing chart and the component gallery's element demos all follow it. The budget is for
  what every admin page loads.

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
| After P5 | 666.2 (**+21.0**, budget then +60) | 58.6 (**+13.4**, budget then +25) |
| After the admin shell (`76c2e02`) | 666.4 (**+21.2**, budget then +60) | 61.2 (**+16.0**, budget then +25) |
| After the command menu and shortcuts (`df2ce9b`) | 669.1 (**+23.9**, budget +150) | 61.6 (**+16.4**, budget +40) |
| After the interactive publishing chart (`d60615b`) | 680.1 (**+34.9**, budget +150) | 61.9 (**+16.7**, budget +40) |

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

## After the command menu and shortcuts (2026-10-17, `df2ce9b`, same setup)

| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |
|---|---|---|---|---|---|---|
| `/admin/login` | 12 | 669.1 | 2256.6 | 7 | 61.6 | 425.5 |
| `/admin` | 12 | 669.1 | 2256.6 | 7 | 61.6 | 425.5 |
| `/admin/collections/articles` | 14 | 679.2 | 2289.0 | 7 | 61.6 | 425.5 |
| `/admin/collections/articles/create` | 13 | 669.3 | 2256.8 | 7 | 61.6 | 425.5 |

- Every page: +2.7 kB JS for the header trigger, the shortcut listener, recent-document tracking
  and the theme transition. The menu and the shortcuts help are one 6.5 kB (gzip) chunk, fetched
  when the pointer reaches the search button or on the first shortcut.
- 126 kB of the raised JS budget and 23.6 kB of the CSS budget are still free.

## After the interactive publishing chart (2026-10-17, `d60615b`, same setup)

| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |
|---|---|---|---|---|---|---|
| `/admin/login` | 13 | 669.6 | 2257.2 | 7 | 61.9 | 427.1 |
| `/admin` | 15 | 680.1 | 2286.7 | 7 | 61.9 | 427.1 |
| `/admin/collections/articles` | 15 | 679.8 | 2289.6 | 7 | 61.9 | 427.1 |
| `/admin/collections/articles/create` | 14 | 669.9 | 2257.4 | 7 | 61.9 | 427.1 |

- `/admin` is the dashboard, so its row includes the chart island, which loads only there (the
  chart chunk itself is 3.0 kB gzip). Every other page is unchanged (+0.5 kB).
- The first version used Recharts: `/admin` measured **787.2 kB (+142.0 of the +150 budget)**,
  with 113 kB (gzip) of Recharts. The same features in plain React and CSS cost about 11 kB, so the
  chart was rebuilt without it. Recharts stayed in the UI kit until the component gallery replaced
  it (ADR 0009); the package is no longer installed.

## After the Payload-native layout and the component gallery (2026-10-19, `d9ba8a3`, same setup)

Measured on a production build (`next build`, `next start`), logged in as an admin. Since `d60615b`
this includes everything shipped in between: trash, sparklines, the developer tools menu, the
responsive pass, the phone list cards and the component gallery.

| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |
|---|---|---|---|---|---|---|
| `/admin/login` | 14 | 674.4 | 2275.0 | 7 | 63.4 | 432.0 |
| `/admin` | 16 | 684.9 | 2304.5 | 7 | 63.4 | 432.0 |
| `/admin/collections/articles` | 16 | 684.5 | 2306.9 | 7 | 63.4 | 432.0 |
| `/admin/collections/articles/create` | 15 | 674.7 | 2275.3 | 7 | 63.4 | 432.0 |
| `/admin/gallery` (admins only) | 22 | 798.3 | 2671.7 | 7 | 63.4 | 432.0 |

- Every page: **684.9 kB JS (+39.7 of the +150 budget)** and **63.4 kB CSS (+18.2 of +40)**.
- The move itself was not measured separately; it shouldn't matter, since the import map references
  the same modules. Removing the Recharts-based chart primitive and `recharts` affected only the
  old UI kit chunk.
- `/admin/gallery` loads the element demos, the Font Awesome icon picker and the chart chunk on
  that page only (`ROUTES=/admin/gallery node scripts/measure-admin-bundle.mjs …`); other pages
  don't pay for it.

## After the settings, roles and integration widgets (2026-10-20, `adff4e0`, same setup)

Measured for the [progress report](../reports/README.md) on a production build (`next build`,
`next start`), logged in as an admin. Since `d9ba8a3`: the Site settings group, the warm light
canvas, the Roles collection, the GraphQL document tab, the Site traffic, Page speed, Deployments
and CI status widgets, and the Page speed fix.

| Route | JS files | JS kB (compressed) | JS kB (decoded) | CSS files | CSS kB (compressed) | CSS kB (decoded) |
|---|---|---|---|---|---|---|
| `/admin/login` | 14 | 674.6 | 2275.7 | 7 | 64.4 | 438.6 |
| `/admin` | 16 | 685.1 | 2305.2 | 7 | 64.4 | 438.6 |
| `/admin/collections/articles` | 16 | 684.7 | 2307.6 | 7 | 64.4 | 438.6 |
| `/admin/collections/articles/create` | 15 | 674.9 | 2275.9 | 7 | 64.4 | 438.6 |
| `/admin/gallery` (admins only) | 22 | 798.5 | 2672.3 | 7 | 64.4 | 438.6 |

- Every page: **685.1 kB JS (+39.9 of the +150 budget)** and **64.4 kB CSS (+19.2 of +40)**. Since
  `d9ba8a3` that is +0.2 kB JS and +1.0 kB CSS: the widgets and the integrations layer are server
  components, and the GraphQL tab's client is a lazy chunk loaded only on that tab.
- 110.1 kB of the JS budget and 20.8 kB of the CSS budget are left for the remaining admin tools
  (jobs, audit log, system page, terminal).

## After the jobs, audit log, system page and terminal (2026-10-20, `6e38888` + this pass)

Measured on production builds (`next build`, `next start`), logged in as an admin, with the demo
content seeded.

**Build note.** This sandbox cannot reach Google Fonts, so the build needs a mocked font response
(`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`) and `next build --webpack`: Turbopack's font loader rejects
the mock. Webpack minifies and splits differently from the Turbopack builds used for the rows
above, and the absolute numbers come out about 55 kB lower. The table below is therefore measured
twice with the same setup — the tree before E5 (`6e61ec5`, in a git worktree sharing
`node_modules`) and this one — and only the difference is compared with the budget.

| Route | JS kB (before E5) | JS kB (now) | Δ | CSS kB (before E5) | CSS kB (now) | Δ |
|---|---|---|---|---|---|---|
| `/admin/login` | 619.7 | 619.6 | −0.1 | 65.5 | 65.6 | +0.1 |
| `/admin` | 629.8 | 629.7 | −0.1 | 65.5 | 65.6 | +0.1 |
| `/admin/collections/articles` | 630.2 | 630.0 | −0.2 | 65.5 | 65.6 | +0.1 |
| `/admin/collections/articles/create` | 619.9 | 619.8 | −0.1 | 65.5 | 65.6 | +0.1 |
| `/admin/gallery` | 731.7 | 732.0 | +0.3 | 65.5 | 65.6 | +0.1 |
| `/admin/system` (new) | — | 619.6 | 0 | — | 65.6 | +0.1 |

- **The jobs admin, the audit log (collection, widget, plugin), the system page and the terminal
  cost nothing on the pages everyone loads.** All four are server components or whole views
  rendered on their own route; the terminal's page shell loads its client console (xterm-free, a
  plain streamed `<pre>`) only on `/admin/terminal`, which a production build answers with 404.
- The audit log collection adds Payload's standard list chunk, already counted for other lists
  (`/admin/collections/*`), and its dashboard widget is server-rendered.
- The accessibility fixes in this pass add one ~0.5 kB client component to every admin page
  (`providers/PaginationLabels`); it replaces nothing, and the measured JS is still level with the
  pre-E5 tree because the E5–E7 chunks are lazy.
- +0.1 kB CSS: the `destructive-emphasis` token and the table container's focus outline.
- `/admin/gallery` +0.3 kB: three more registry rows.

Budget status: **unaffected** — the last Turbopack measurement (685.1 kB / 64.4 kB on `/admin`)
plus a delta of about zero stays inside +150 kB / +40 kB.
