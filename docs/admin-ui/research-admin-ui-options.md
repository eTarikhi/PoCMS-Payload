# Admin UI research — modernising the Payload admin panel

**Status:** research complete · TailAdmin Free selected and piloted (see [`tailadmin-pilot.md`](./tailadmin-pilot.md))
**Last updated:** 2026-10-12
**Payload version at time of writing:** 3.90.2 · **Next.js:** 16.3.8 · **React:** 19.2.6 · **Tailwind CSS:** 4.3.x

This document answers the question: *"Which modern, responsive, user-friendly admin
templates or component libraries can we integrate with Payload CMS to replace — or
significantly customise — its default admin interface, and what would it take?"*

---

## 1. What Payload actually lets us do

Before comparing templates it matters what Payload 3 exposes as extension points,
because a template that ignores them fights the framework instead of layering on it.

| Extension point | Config key | What it enables | Risk |
|---|---|---|---|
| Global admin stylesheet | `src/app/(payload)/custom.scss` | Inject any CSS (including a compiled Tailwind build) into every admin page | Low |
| Custom components | `admin.components.*` | Replace or inject React components at ~20 named slots (actions, dashboards, nav links, login, providers, graphics, etc.) | Low–Medium |
| Root views | `admin.components.views.*` | Add brand-new top-level routes (`/admin/:path`) or replace built-ins (`dashboard`, `account`) | Medium |
| Navigation replacement | `admin.components.Nav` | Replace the whole sidebar with a custom component | Medium–High |
| Providers | `admin.components.providers` | Wrap the entire admin panel in context providers (theming, i18n, query clients) | Medium |
| Modular dashboard | `admin.dashboard` | Compose the stock dashboard from typed widgets | Low |
| Theming tokens | `--theme-*` CSS custom properties | Re-skin colours/radii/fonts without touching selectors | Low |

Two facts shape everything below:

1. **Payload's own CSS is wrapped in `@layer payload-default`**, so any CSS we add
   automatically wins on specificity. A template's *preflight/reset* will therefore
   destroy Payload's BEM components unless it is omitted or scoped
   ([payload#8878](https://github.com/payloadcms/payload/issues/8878) is the canonical
   cautionary tale).
2. **Payload admin is a React Server Component app.** Custom components are RSCs by
   default, can be client components (`'use client'`), and are wired through an
   auto-generated import map using **path strings**, not component references.

Any viable template must respect both constraints.

---

## 2. Candidate options compared

Six realistic options were evaluated. Scoring is relative to this repository's stack
(Next 16 App Router, React 19, Tailwind 4, TypeScript, pnpm).

| # | Option | License | Stack match | Integration surface | Effort | Risk | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **TailAdmin Free (Next.js)** | MIT | Next 16 / React 19 / Tailwind 4 — **identical** | Full design system + app shell | Low–Med | Low | ✅ **Recommended pilot** |
| 2 | shadcn/ui admin starter (e.g. `next-shadcn-dashboard-starter`) | MIT | Tailwind + Radix; Next 14/15 typical | Component library, not a fixed shell | Medium | Low | ✅ Best long-term building kit |
| 3 | Admin One (React/Tailwind, justboil) | MIT | React + Tailwind 3 (needs v4 port) | Prebuilt dashboard pages | Medium | Med | Possible, weaker Tailwind-4 fit |
| 4 | Materio (MUI) | MIT/free tier | React + MUI (Emotion) | Prebuilt MUI dashboard | High | Med–High | Styling paradigm clash |
| 5 | Horizon UI (Chakra) | Custom | React + Chakra | Prebuilt dashboard | High | Med–High | Styling paradigm clash |
| 6 | Keep & theme Payload native | — | n/a | CSS variables + targeted overrides | Very low | Very low | Always the safe baseline |

### Why TailAdmin Free wins the pilot

- **Zero framework downgrade.** Its free Next.js edition targets Next 16 / React 19 /
  Tailwind v4 — the exact versions this repo already runs. No adapter layer, no version
  shims.
- **MIT licensed**, so it can be vendored into `src/` and modified freely.
- **It is a design system, not just a mockup:** colour/type/shadow/z-index tokens,
  ~50 UI primitives (buttons, badges, cards, tables, avatars, dropdowns, modals,
  alerts), an app shell (sidebar + header + backdrop), and ApexCharts wrappers.
- **The hard parts are already solved upstream:** responsive sidebar collapse/hover,
  mobile drawer + backdrop, animated submenus, dark mode. We port them rather than
  rebuild them.
- Its only third-party chart dependency (ApexCharts) is already added to this repo.

### Why shadcn/ui is the strategic follow-up

shadcn/ui is not a fixed shell — it is an accessible, unstyled component kit built on
Radix that you copy into your repo. It pairs perfectly with Tailwind v4 and is the
community standard for Payload admin customisation (Payload publishes an official
shadcn setup guide). It is the right tool for **Phase 3+** once we know which surfaces
we are rebuilding for real, because it composes with whatever we keep from the pilot.

### Why MUI/Chakra templates are not recommended here

Both bring a competing styling runtime (Emotion / Chakra's style prop) into an admin
panel that already ships Payload's SCSS plus our Tailwind. Two styling systems +
Payload's layers = specificity arms races and a heavy client bundle. They are listed for
completeness, not endorsement.

---

## 3. Per-template roadmap & skills

Each recommendation gets a **phased roadmap** (what to build, in what order, and how to
de-risk it) plus the **skills, frameworks and tools** a developer needs.

### 3.1 TailAdmin Free (Next.js) — recommended first pilot

**Goal:** a TailAdmin-styled content dashboard inside the Payload admin panel, driven by
real data, without breaking the stock panel.

**Phased roadmap**

| Phase | Scope | Deliverable | De-risking |
|---|---|---|---|
| **0 — Scope & spike** | Confirm stack match, license, Payload extension points | This doc + a throwaway scoped-CSS spike | Verify Tailwind compiles without preflight; confirm `source(none)` scoping |
| **1 — Foundations** | Tailwind v4 wiring, scoped stylesheet, vendored tokens/utilities, icon mapping | `postcss.config.mjs`, `tailadmin.css`, `cn()`, Lucide icon bridge | CLI-compiles in isolation; no Bootstrap/Payload leakage |
| **2 — Design-system port** | UI primitives (button, badge, avatar, dropdown, table, alert, card) | `ui/` components + a `/ui-kit` gallery to eyeball them | Server/client boundary respected; light + dark both render |
| **3 — Data layer** | Server-only stats via the Local API, honouring permissions | `buildContentStats()` with per-query `try/catch` | Every query `overrideAccess:false` + `req`/`user`; unit-tested pure helpers |
| **4 — Dashboard surfaces** | KPI grid, growth chart, collection breakdown, recent docs, quick actions | `/admin/tailadmin` full shell + `/admin` dashboard override | Each block degrades to a warning banner on failure |
| **5 — Integration & modes** | `beforeDashboard` KPI strip, `afterNavLinks` link, provider-gated whole-admin theme, env-gated modes | `buildTailAdminComponents()` | `full` is the default; `off` restores the stock panel entirely |
| **6 — Harden & QA** | Real-data test, a11y pass, responsive pass, telemetry of usage | Signed-off pilot | Manual QA against seeded content |

**Skills / frameworks / tools**

| Area | Needed |
|---|---|
| Languages | TypeScript (strict), modern ES |
| React | Server Components, client boundaries, context, `useSyncExternalStore`, dynamic import (`next/dynamic`, `ssr:false`) |
| Next.js | App Router, route conventions, `next/link`, `next/navigation`, `next/headers` |
| Styling | **Tailwind CSS v4** (`@theme`, `@utility`, `@custom-variant`, `source(none)`, `@source`), CSS cascade layers, PostCSS |
| Payload | Config (`admin.components`, root views), Local API (`payload.find/count`), import map, `useConfig`/`useTheme`, access control, RSC views |
| Data viz | ApexCharts (`react-apexcharts`), `apexcharts` option typing |
| Icons | `lucide-react` (replacing upstream `@svgr/webpack` SVG imports) |
| Tooling | pnpm, ESLint flat config, Vitest, `payload generate:importmap`, `tailwindcss` CLI |

### 3.2 shadcn/ui admin starter — recommended long-term building kit

**Goal:** a maintainable, accessible component foundation for any future admin rebuild.

| Phase | Scope |
|---|---|
| 1 | Install shadcn/ui per Payload's official guide; align Tailwind v4 theme + CSS variables with Payload's `data-theme` dark mode |
| 2 | Port the data layer built in the TailAdmin pilot (it is template-agnostic) |
| 3 | Rebuild priority surfaces with shadcn primitives (Table, Command palette for quick-jump, DropdownMenu, Dialog) |
| 4 | Replace the sidebar with a shadcn `Sidebar` wired to Payload nav groups |

**Skills:** everything in 3.1, plus **Radix UI primitives** and **shadcn/ui theming**
(CSS-variable driven, `darkMode: ['selector','[data-theme=dark]']`).

### 3.3 Admin One (React + Tailwind) — viable alternative

| Phase | Scope |
|---|---|
| 1 | Port its Tailwind **3** config to v4 tokens (this is the main work) |
| 2 | Vendor its menu/sidebar components; strip its routing to Payload routes |
| 3 | Reuse the same Local-API data layer |

**Skills:** as 3.1, plus Tailwind v3→v4 migration knowledge. **Extra risk:** weaker
Tailwind-4 alignment means more token translation.

### 3.4 Materio (MUI) / Horizon UI (Chakra) — not recommended for this repo

| Phase | Scope |
|---|---|
| 1 | Introduce Emotion/Chakra theming alongside Payload SCSS |
| 2 | Isolate the template in a root view to avoid global style bleed |
| 3 | Accept a larger client bundle and two styling paradigms |

**Skills:** React + **MUI/Emotion** *or* **Chakra UI**, plus careful CSS-layer
management. **Why not:** styling-system clash and bundle weight with no clear upside
over the Tailwind-native options.

### 3.5 Keep & theme Payload native — the safe baseline

| Phase | Scope |
|---|---|
| 1 | Override `--theme-*` variables to match the brand palette |
| 2 | Add targeted component overrides (primary button accent, nav indicator, radii) |
| 3 | Optionally adopt `admin.dashboard` modular widgets |

**Skills:** CSS custom properties, Payload SCSS variables. **Risk:** lowest possible.
The whole-admin theme now lives in `styles/tailadmin-theme.css`, gated by the
`TailAdminThemeProvider` and enabled by default in `full` mode; `off` remains the complete
stock-panel rollback.

---

## 4. Recommendation

1. **Selected and implemented:** TailAdmin Free is the first pilot. The follow-up
   implementation applies its theme across the whole admin panel by default (`full`), as
   requested, while keeping Payload's native navigation and editing behaviour.
2. **Evaluate against real content** in light and dark mode, on mobile and desktop. Set
   `POCMS_ADMIN_UI=additive` for an appearance-preserving comparison or `off` for a
   complete stock-panel rollback.
3. **Consider shadcn/ui** as a long-term component foundation if a deeper structural
   rebuild is green-lit; the data layer and shell logic can port over.
4. The native Payload components remain the fallback, with `POCMS_ADMIN_UI=off`; the
   TailAdmin theme is gated by its provider and does not rewrite Payload source styles.

## 5. Key sources

- Payload docs — [Customizing CSS](https://payloadcms.com/docs/admin/customizing-css),
  [Custom components overview](https://payloadcms.com/docs/custom-components/overview),
  [Root components](https://payloadcms.com/docs/custom-components/root-components),
  [Custom views](https://payloadcms.com/docs/custom-components/custom-views)
- Payload guide — [Theme the admin panel with Tailwind CSS 4](https://payloadcms.com/posts/guides/how-to-theme-the-payload-admin-panel-with-tailwind-css-4)
  and [shadcn/ui setup](https://payloadcms.com/posts/guides/how-to-setup-tailwindcss-and-shadcn-ui-in-payload)
- Payload issue — [Tailwind preflight breaks admin styles (#8878)](https://github.com/payloadcms/payload/issues/8878)
- TailAdmin Free — [free-nextjs-admin-dashboard](https://github.com/TailAdmin/free-nextjs-admin-dashboard) (MIT) and its
  [overview blog post](https://tailadmin.com/blog/free-nextjs-admin-dashboard)
