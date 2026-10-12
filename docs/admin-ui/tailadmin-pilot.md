# TailAdmin Free — Payload admin-UI pilot

This branch vendors the **TailAdmin Free (Next.js)** design system into the Payload
admin panel and wires it in through Payload's official extension points. It is an
**additive pilot**: by default it adds new TailAdmin-styled surfaces *beside* the stock
admin panel and never replaces it, so it is safe to run.

- Template: [TailAdmin free-nextjs-admin-dashboard](https://github.com/TailAdmin/free-nextjs-admin-dashboard) (MIT)
- Research & alternatives: [`research-admin-ui-options.md`](./research-admin-ui-options.md)
- Phased roadmap & skills: [`roadmap.md`](./roadmap.md)

---

## 1. Try it

1. Install and run the project normally (`pnpm install`, `pnpm dev`) with a working
   `POSTGRES_URL`.
2. Sign in to `/admin`.
3. Open the pilot:
   - **`/admin/tailadmin`** — full TailAdmin dashboard in its own shell (sidebar + header).
   - **`/admin/tailadmin/ui-kit`** — the TailAdmin component gallery.
   - The stock `/admin` dashboard now shows a small **Content overview** strip at the top
     and **TailAdmin** links in the sidebar.

The integration mode is controlled by the `POCMS_ADMIN_UI` environment variable:

| Value | What changes |
|---|---|
| `off` | Nothing. Stock Payload panel, 100%. |
| `additive` *(default)* | New `/admin/tailadmin` routes + a KPI strip on the stock dashboard + sidebar links. Stock UI untouched. |
| `dashboard` | Everything in `additive`, **plus** `/admin` itself renders the TailAdmin dashboard (inside Payload's template, so the stock nav/header/account menu remain). |
| `full` | Everything in `dashboard`, **plus** Payload's sidebar is replaced by the TailAdmin sidebar and the TailAdmin **theme bridge** re-skins the whole stock panel. |

Other knobs (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `POCMS_ADMIN_UI_GROWTH_MONTHS` | `12` | Months of history in the content-growth chart (3–24). |
| `POCMS_ADMIN_UI_RECENT_LIMIT` | `8` | Rows in "Recently updated" (1–25). |
| `POCMS_ADMIN_UI_COLLECTION_LIMIT` | `12` | Collections shown in the breakdown (1–50). |
| `POCMS_ADMIN_UI_GROWTH_COLLECTION` | auto | Force the growth chart to a specific collection slug. |
| `POCMS_ADMIN_UI_COLLECTIONS` | auto | Comma-list of collection slugs to include in the breakdown. |
| `POCMS_ADMIN_UI_BRAND` | `PoCMS` | Brand name shown in the shell. |
| `POCMS_ADMIN_UI_BRAND_SHORT` | first 2 letters | Collapsed brand mark. |
| `POCMS_ADMIN_UI_TAGLINE` | `TailAdmin pilot` | Brand tagline. |

To switch modes, set the variable and restart `pnpm dev`. The import map regenerates
automatically on startup (or run `pnpm generate:importmap`).

---

## 2. What was added

```text
postcss.config.mjs                     # registers @tailwindcss/postcss only
src/admin-ui/tailadmin/
├── config.ts                          # builds the admin.components fragment per mode
├── paths.ts                           # route constants (/tailadmin, /tailadmin/ui-kit)
├── index.ts                           # public, config-safe barrel
├── icons.tsx                          # TailAdmin icon names → lucide-react bridge
├── styles/
│   ├── tailadmin.css                  # scoped Tailwind v4 design system (see §3)
│   └── payload-bridge.css             # opt-in re-skin of Payload variables (§5)
├── lib/
│   ├── cn.ts                          # clsx + tailwind-merge (TailAdmin `cn`)
│   └── format.ts                      # pure number/date helpers (unit-tested)
├── data/
│   ├── types.ts                       # serialisable DTOs shared server → client
│   ├── navGroups.ts                   # pure: config+permissions → sidebar tree (tested)
│   ├── contentStats.ts                # server-only Local API queries (tested guards)
│   ├── serverData.ts                  # loadAdminUiData() + toShellUser()
│   ├── buildShellModel.ts             # nav tree → shell props (sidebar/search/brand)
│   └── quickActions.ts                # create-shortcuts gated by permissions (tested)
├── ui/                                # TailAdmin primitives (button, badge, avatar,
│   └── …                              #   dropdown, table, alert, card)
├── context/TailAdminSidebarContext.tsx# sidebar state (ported)
├── layout/                            # TailAdminSidebar / Header / Backdrop / Shell
├── blocks/                            # KpiGrid, GrowthChart, Breakdown, RecentDocs,
│   └── …                              #   QuickActions, WarningsBanner, UiKitGallery
├── views/
│   ├── TailAdminDashboardView.tsx     # /admin/tailadmin  (full shell)
│   ├── TailAdminUiKitView.tsx         # /admin/tailadmin/ui-kit
│   └── TailAdminDashboardOverride.tsx # replaces /admin (modes dashboard/full)
├── nav/
│   ├── TailAdminNavLinks.tsx          # afterNavLinks (additive links)
│   ├── TailAdminNav.tsx               # Nav replacement (mode full)
│   └── TailAdminNavClient.tsx         # client sidebar for the Nav replacement
├── dashboard/TailAdminKpiStrip.tsx    # beforeDashboard KPI strip
└── providers/TailAdminThemeProvider.tsx # enables the theme bridge (mode full)

tests/int/admin-ui.int.spec.ts         # 14 unit tests (format, navGroups, quickActions)
docs/admin-ui/                         # this documentation
```

`payload.config.ts` gained three lines that read the mode and inject the matching
`admin.components` fragment:

```ts
import { buildTailAdminComponents, resolvePilotMode } from './admin-ui/tailadmin'
const adminUiMode = resolvePilotMode()
// …
admin: { components: buildTailAdminComponents(adminUiMode), /* … */ }
```

---

## 3. How Tailwind is kept from breaking anything

This is the heart of the integration and the part that most Tailwind-in-Payload attempts
get wrong:

- **No global preflight.** Tailwind's reset is re-implemented by hand and scoped to a
  `.ta-root` wrapper (full surfaces) or a lighter `.ta-inline` wrapper (blocks injected
  into Payload chrome). Payload's own components keep their reset.
- **No auto content scanning.** The stylesheet uses `source(none)` + an explicit
  `@source` pointing only at `src/admin-ui/**`, so Bootstrap class names on the frontend
  can never be compiled into Tailwind utilities. (Verified: `col-md`, `btn-primary`,
  `d-flex` produce zero matches in the compiled CSS.)
- **Dark mode follows Payload.** The Tailwind `dark:` variant is bound to Payload's
  `html[data-theme='dark']` attribute via `@custom-variant`, so TailAdmin reacts to the
  theme toggle Payload already provides — one theme system, one preference key.
- **Layer order.** Payload wraps its CSS in `@layer payload-default`; the Tailwind layers
  are declared after it, so Tailwind utilities win where they apply — and they only apply
  to markup that carries Tailwind classes, which Payload never emits.
- **The stylesheet is imported by the components themselves**, not by the Payload-generated
  `layout.tsx`/`custom.scss`, so it is only fetched when a TailAdmin surface mounts and it
  survives Payload regenerating those files.

## 4. Data & permissions

Every number on the dashboard comes from the **Payload Local API** queried with the
signed-in principal:

- Queries run with `overrideAccess: false` plus the current `req` (root views) or `user`
  (`beforeDashboard`, which receives no `req`), so the dashboard can never show documents
  the user is not allowed to read.
- Each collection count / recent-docs / growth query is individually wrapped in
  `try/catch`; a failure becomes an entry in `warnings[]` and a visible banner rather than
  a 500.
- Create shortcuts (`Quick actions`) are only offered when the user has `create` access.
- Root views are React Server Components; they pass plain JSON to client components, so
  nothing unserialisable (functions, class instances, component refs) crosses the boundary
  — icons travel as *names* resolved through `icons.tsx`.

## 5. The opt-in theme bridge (mode `full`)

`styles/payload-bridge.css` re-points Payload's CSS custom properties (`--color-base-*`,
`--color-success/error/warning-*`, `--theme-bg/text/border`, `--style-radius-*`,
`--font-body`) at the TailAdmin palette, plus targeted overrides for the primary/secondary
buttons, nav indicator and focus ring. It is only active when `TailAdminThemeProvider`
sets `html[data-ta-theme="on"]`, which only happens in `full` mode — so the stock look
returns the moment you switch modes. This is deliberately done with **variables, not
selectors**, so it survives Payload renaming class names in future releases.

## 6. Verification performed

- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec eslint src/admin-ui src/payload.config.ts` — clean (0 errors).
- `pnpm exec vitest run tests/int/admin-ui.int.spec.ts` — 14/14 pass.
- `pnpm exec tailwindcss` compile of `tailadmin.css` — utilities, tokens, scoped base and
  Payload-keyed dark variant all emit; zero Bootstrap leakage.
- `pnpm generate:importmap` — generates the expected entries in both `additive` and `full`
  modes.
- `next build` — **compiles and type-checks successfully**; the remaining build steps fail
  only because the sandbox has no Postgres/Google-Fonts network access (environmental,
  pre-existing — unrelated to this change).

## 7. Known limitations / next steps

- The growth chart uses `payload.count` per month bucket; for very large collections this
  is N queries. A future optimisation is a single aggregation or a cached rollup.
- `TailAdminNav` (mode `full`) resolves the user via `payload.auth({ headers })`; on any
  failure it renders a minimal fallback link list so navigation is never lost.
- The avatar always uses initials or a direct URL (`<img>`) rather than `next/image`, to
  avoid remote-origin image-config issues with Vercel Blob media.
- Manual QA against seeded content (light + dark, mobile → desktop) is the natural next
  step before promoting to `dashboard`/`full`.
