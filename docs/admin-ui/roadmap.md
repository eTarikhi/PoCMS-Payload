# TailAdmin Free pilot — phased development roadmap

Execution roadmap for turning the TailAdmin Free pilot into a production-grade admin
experience. Phases 0–5 of this roadmap are **already implemented in this branch**; Phase 6
and beyond are the remaining work. Each phase lists tasks, acceptance criteria, and the
skills/tools it exercises.

> Legend: ✅ done in this branch · 🔜 next · 🗓 later

---

## Phase 0 — Scope, spike & guardrails ✅

**Purpose:** prove the approach is safe before writing real code.

- ✅ Confirm stack parity (Next 16 / React 19 / Tailwind v4) — no downgrades required.
- ✅ Confirm the MIT licence allows vendoring and modification.
- ✅ Map Payload extension points (`admin.components.*`, root views, providers).
- ✅ Spike a scoped Tailwind stylesheet and prove it compiles without emitting a global
  preflight and without scanning the Bootstrap frontend.

**Acceptance criteria:** Tailwind CLI compiles the scoped stylesheet; no Bootstrap or
Payload selectors appear in the output; `source(none)` + `@source` scoping verified.

**Skills/tools:** Tailwind CSS v4 internals (`@theme`, `@utility`, `@custom-variant`,
`source(none)`, cascade layers), PostCSS, Payload docs.

## Phase 1 — Foundations & theming plumbing ✅

- ✅ Add `postcss.config.mjs` with `@tailwindcss/postcss` only.
- ✅ Create `styles/tailadmin.css` (tokens, scoped base, component utilities, ApexCharts
  overrides) keyed to Payload's `data-theme` dark mode.
- ✅ Add `cn()` (clsx + tailwind-merge) and Lucide icon bridge (replacing upstream
  `@svgr/webpack` SVG imports so `next.config.ts` stays untouched).
- ✅ Add pure helpers (`lib/format.ts`) with unit tests.

**Acceptance criteria:** tokens emit; dark variant follows `html[data-theme='dark']`;
icon set resolves; `format.ts` helpers unit-tested.

**Skills/tools:** Tailwind v4, PostCSS, `lucide-react`, `tailwind-merge`, Vitest.

## Phase 2 — Design-system port ✅

- ✅ Port UI primitives: Button, Badge, Avatar, Dropdown(+Item), Table, Alert, Card/Panel.
- ✅ Port the app shell: `TailAdminSidebar`, `TailAdminHeader`, `TailAdminBackdrop`,
  `TailAdminShell`, and the `SidebarContext`.
- ✅ Build the `/admin/tailadmin/ui-kit` gallery so every primitive can be eyeballed in
  light and dark mode.

**Acceptance criteria:** every primitive renders inside the Payload admin panel in both
themes; client/server boundaries compile; sidebar collapse/hover/mobile-drawer behave like
upstream.

**Skills/tools:** React Server Components vs client components, `next/dynamic`
(`ssr:false`) for ApexCharts, `useSyncExternalStore`, Payload import-map conventions.

## Phase 3 — Data layer ✅

- ✅ `buildContentStats()` — per-collection counts, recent documents, monthly growth, all
  via the Local API with `overrideAccess:false` and the current principal.
- ✅ `buildNavGroups()` / `buildShellModel()` — config + permissions → sidebar tree +
  quick-jump index (pure, unit-tested).
- ✅ `buildQuickActions()` — create shortcuts gated by `create` permission (unit-tested).
- ✅ Graceful degradation: every query guarded; failures surface as warnings, not 500s.

**Acceptance criteria:** a user sees only what their access allows; one broken collection
degrades to a banner; helpers are deterministic and tested.

**Skills/tools:** Payload Local API (`find`/`count`), access control, RSC data flow,
permissions shape (`SanitizedPermissions`).

## Phase 4 — Dashboard surfaces ✅

- ✅ KPI grid (documents, collections, media, users).
- ✅ Content-growth area chart (monthly/quarterly/annual aggregation).
- ✅ Collection breakdown table with volume bars.
- ✅ Recently-updated table with relative timestamps + draft/published badges.
- ✅ Quick actions panel.
- ✅ Full-shell route `/admin/tailadmin` and the stock-dashboard override.

**Acceptance criteria:** `/admin/tailadmin` renders real data; `/admin` override keeps
Payload's nav/header/account menu intact.

**Skills/tools:** ApexCharts options typing, date bucketing, responsive grid layout.

## Phase 5 — Integration modes & whole-admin theming ✅

- ✅ `beforeDashboard` KPI strip and `afterNavLinks` links (additive entry points).
- ✅ `TailAdminThemeProvider` + `tailadmin-theme.css` apply the TailAdmin palette and
  component styling to every admin route in `full` mode.
- ✅ Native Payload navigation is restyled in place instead of replaced, preserving its
  grid layout, mobile drawer, keyboard access, and account controls.
- ✅ `buildTailAdminComponents()` supports `off`/`additive`/`dashboard`/`full`, with
  `full` as the default and env-driven rollback options.
- ✅ Import-map generation verified in `additive` and `full` modes.

**Acceptance criteria:** every mode produces the expected import-map entries; `off`,
`additive`, and `dashboard` retain Payload's native styling; `full` applies the TailAdmin
theme across login/auth pages, dashboard, lists, edit views, settings, drawers, modals,
and toasts; light/dark mode follows Payload's `data-theme` attribute.

**Skills/tools:** Payload `admin.components` slots, React context providers, CSS custom
properties, cascade layers, Tailwind scoping, import-map generation.

## Phase 6 — Hardening & sign-off 🔜

- [ ] **Manual QA against seeded content**: verify the full theme in light + dark, mobile
      → desktop, and across login, dashboard, list, edit, settings, drawer, and modal views;
      compare `full` against `additive` and `off`.
- [ ] **Accessibility pass**: keyboard navigation in the native sidebar/header dropdowns,
      visible focus rings, ARIA labels, reduced motion, and colour contrast for the brand
      palette.
- [ ] **Performance**: ensure the dashboard's query fan-out stays fast on large datasets;
      add React `cache()`/`unstable_cache()` where appropriate; consider a single
      aggregation query for the growth chart.
- [ ] **i18n**: route user-facing labels through Payload's `i18n` so the pilot respects
      admin translations.
- [ ] **Telemetry/feedback**: collect qualitative feedback from editors using the
      whole-admin TailAdmin theme.

**Skills/tools:** Playwright (repo already has e2e specs), Lighthouse/axe, Payload i18n.

## Phase 7 — Long-term component strategy 🗓

- [ ] If the TailAdmin look is a fit, decide whether to keep Payload's native list/edit
      components with the global theme or incrementally replace selected screens with
      TailAdmin primitives.
- [ ] If a deeper accessible rebuild is wanted, adopt **shadcn/ui** (Payload's official
      guide) and port this branch's data layer + shell logic over unchanged.
- [ ] Keep the `off` rollback mode and `data-ta-theme` provider gate regardless of the
      longer-term component strategy.

**Skills/tools:** shadcn/ui + Radix, design-token governance, migration planning.

---

## Skills, frameworks & tools — consolidated matrix

| Capability | Used in this branch | Where to learn |
|---|---|---|
| TypeScript (strict) | everywhere | — |
| React 19 / Server Components | views, blocks, data flow | react.dev (RSC) |
| Next.js App Router | routing, `next/link`, `next/navigation`, `next/headers`, `next/dynamic` | nextjs.org |
| Tailwind CSS v4 | tokens, scoped preflight, dark variant, source scoping | tailwindcss.com |
| CSS cascade layers & custom properties | Tailwind isolation + whole-admin theme | MDN |
| Payload 3 config & components | `admin.components.*`, root views, providers, import map | payloadcms.com/docs |
| Payload Local API + access control | all data queries | payloadcms.com/docs |
| ApexCharts | growth chart | apexcharts.com |
| lucide-react | icon bridge | lucide.dev |
| clsx + tailwind-merge | `cn()` | npm |
| Vitest | unit tests | vitest.dev |
| ESLint flat config | lint rules | eslint.org |
| pnpm | dependency management | pnpm.io |

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tailwind preflight/leakage breaks stock panel | Low (guarded) | High | Scoped `.ta-root`/`.ta-inline`, `source(none)`, layer order; verified in §6 of the pilot doc |
| Query fan-out slows the dashboard on big data | Medium | Medium | Per-query guards now; aggregation/caching in Phase 6 |
| Payload changes internal selector names (mode `full`) | Low | Medium | Core colors use Payload CSS variables; targeted TailAdmin rules use documented selectors and are checked against the installed version; `off`/`additive` remain rollback options |
| Google-Fonts/offline build issues | Environmental | Low | Pilot avoids `next/font/google`; Outfit degrades to system fonts |
