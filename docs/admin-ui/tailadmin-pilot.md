# TailAdmin Free — Payload admin-UI pilot

This branch vendors the **TailAdmin Free (Next.js)** design system into the Payload
admin panel and wires it in through Payload's official extension points. By default,
`full` mode applies the TailAdmin look across **all admin pages and elements**. It keeps
Payload's native navigation and editing components, restyling them rather than replacing
their underlying behaviour. Use `additive` or `off` for the stock Payload appearance.

- Template: [TailAdmin free-nextjs-admin-dashboard](https://github.com/TailAdmin/free-nextjs-admin-dashboard) (MIT)
- Research & alternatives: [`research-admin-ui-options.md`](./research-admin-ui-options.md)
- Phased roadmap & skills: [`roadmap.md`](./roadmap.md)

---

## 1. Try it

1. Install and run the project normally (`pnpm install`, `pnpm dev`) with a working
   `POSTGRES_URL`.
2. Sign in to `/admin`.
3. Open the admin:
   - **`/admin`** — the TailAdmin dashboard inside Payload's default shell (the default
     `full` mode); the native sidebar and header keep their built-in behaviour, but are
     styled with the TailAdmin theme.
   - **`/admin/tailadmin`** — the full TailAdmin dashboard in its own shell (sidebar +
     header); **`/admin/tailadmin/ui-kit`** opens the component gallery.
   - To compare against the stock dashboard with only the **Content overview** strip and
     TailAdmin links, set `POCMS_ADMIN_UI=additive` and restart the app.

The integration mode is controlled by the `POCMS_ADMIN_UI` environment variable:

| Value | What changes |
|---|---|
| `off` | Nothing. Stock Payload panel, 100%. |
| `additive` | New `/admin/tailadmin` routes + a KPI strip on the stock dashboard + sidebar links. Stock appearance retained. |
| `dashboard` | Everything in `additive`, **plus** `/admin` itself renders the TailAdmin dashboard inside Payload's template. Native sidebar/header remain; stock styling retained. |
| `full` *(default)* | Everything in `dashboard`, **plus** the TailAdmin theme re-skins all admin pages and elements. Payload's native sidebar is restyled in place to preserve responsive layout and accessibility. |

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
│   └── tailadmin-theme.css            # whole-admin TailAdmin theme, gated by the provider (§5)
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
│   └── TailAdminNavLinks.tsx          # afterNavLinks (additive links)
├── dashboard/TailAdminKpiStrip.tsx    # beforeDashboard KPI strip
└── providers/TailAdminThemeProvider.tsx # enables the whole-admin theme (mode full)

tests/int/admin-ui.int.spec.ts         # unit tests (config, format, navGroups, quickActions)
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
- `tailadmin.css` is imported by TailAdmin surfaces, not the Payload-generated
  `layout.tsx`/`custom.scss`, so its scoped utilities survive Payload regenerating those
  files. The separate `tailadmin-theme.css` is imported by the `full`-mode provider and
  applies only while that provider is mounted; every rule is gated by
  `html[data-ta-theme="on"]`.

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

## 5. Whole-admin TailAdmin theme (mode `full`, the default)

`styles/tailadmin-theme.css` re-points Payload's CSS custom properties (`--color-base-*`,
`--color-success/error/warning-*`, `--theme-bg/text/border`, `--style-radius-*`, and
`--font-body`) to the TailAdmin palette. Payload maps those tokens onto its elevation
ramp, so list views, document editors, settings, auth pages, and other stock screens pick
up the new colors in both light and dark mode. Targeted styles add TailAdmin treatments to
the native sidebar, buttons, form controls, tables, cards, popups, drawers, confirmation
dialogs, toasts, and login card.

`TailAdminThemeProvider` is registered through `admin.components.providers` in `full`
mode. It sets `html[data-ta-theme="on"]` before paint, and every theme rule is gated by
that attribute. `off`, `additive`, and `dashboard` therefore retain Payload's native
appearance; switching modes restores the stock styling without rebuilding or leaving
orphaned global styles. The native sidebar is styled in place instead of being replaced,
which avoids fighting Payload's grid-based layout and preserves its mobile/keyboard
behaviour.

The palette is variable-first for broad compatibility; targeted selectors are used only
where a component needs TailAdmin-specific shape, hover, focus, or layout treatment. The
stylesheet remains scoped to the admin provider and does not change the public frontend.

## 6. Verification performed

- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec eslint src/admin-ui src/payload.config.ts tests/int/admin-ui.int.spec.ts` —
  0 errors (two existing unused-variable warnings in `payload.config.ts`).
- `pnpm exec vitest run tests/int/admin-ui.int.spec.ts` — 17/17 pass, including checks
  for the default `full` mode and provider registration.
- `pnpm admin-ui:css` — Tailwind utilities, tokens, scoped base, and Payload-keyed dark
  variant compile; the generated CSS has zero Bootstrap leakage.
- Theme stylesheet parsed with PostCSS; all theme rules are gated by
  `html[data-ta-theme="on"]`.
- `pnpm generate:importmap` — verified both `additive` and default `full` maps; only
  `full` includes the theme provider and dashboard override, and neither uses the removed
  custom `Nav` override.
- `pnpm build:compile` — optimized production compile passed. The sandbox cannot fetch
  Google Fonts, so `Open_Sans` was temporarily stubbed for this check and the frontend
  layout was restored byte-for-byte afterward; full data-generation still requires the
  project's Postgres connection.

## 7. Known limitations / next steps

- The growth chart uses `payload.count` per month bucket; for very large collections this
  is N queries. A future optimisation is a single aggregation or a cached rollup.
- `full` mode keeps Payload's native sidebar and restyles its actual nav classes; this is
  intentional because the default template positions it as a grid column, and replacing it
  with a fixed-position sidebar breaks that layout. The dedicated `/admin/tailadmin` route
  still uses the full TailAdmin shell.
- The avatar in the dedicated TailAdmin shell uses initials or a direct URL (`<img>`) rather
  than `next/image`, to avoid remote-origin image-config issues with Vercel Blob media.
- Manual QA of the global theme against seeded content (light + dark, mobile → desktop,
  login, collection lists, document editing, drawers and modals) remains the next step.
