# `src/admin-ui` — Payload admin-panel UI extensions

This module contains the customisations for the **Payload admin panel**. It is
self-contained: only `src/payload.config.ts` wires it in, so the pilot can be adjusted
with the `POCMS_ADMIN_UI` environment variable.

The current integration is **TailAdmin Free** in [`tailadmin/`](./tailadmin/). The
`full` mode is the default and applies the TailAdmin theme across the whole admin panel;
`additive`, `dashboard`, and `off` remain available as alternatives or rollback modes.

## Entry points

| File | Purpose |
|---|---|
| `tailadmin/config.ts` | Builds the `admin.components` fragment for the selected mode. Imported by `payload.config.ts`; no React/CSS runtime imports. |
| `tailadmin/paths.ts` | Route constants (`/tailadmin`, `/tailadmin/ui-kit`). |
| `tailadmin/index.ts` | Public, config-safe barrel. Import from here. |

## Layout

```text
tailadmin/
├── config.ts, paths.ts, index.ts      # wiring + constants
├── styles/                            # scoped Tailwind + whole-admin TailAdmin theme
├── lib/                               # cn() + pure formatting helpers
├── data/                              # server-only Local-API queries + pure nav/quick-action builders
├── icons.tsx                          # TailAdmin icon names → lucide-react
├── ui/                                # primitives (button, badge, avatar, dropdown, table, alert, card)
├── context/, layout/                  # TailAdmin shell for the dedicated /tailadmin route
├── blocks/                            # dashboard widgets + UI-kit gallery
├── views/                             # /tailadmin, /tailadmin/ui-kit, and /admin override
├── nav/                               # additive TailAdmin links in Payload's native sidebar
├── dashboard/                         # beforeDashboard KPI strip
└── providers/                         # whole-admin theme provider (mode full)
```

## Guiding principles

1. **Whole panel by default.** `full` re-skins Payload's native components on every
   admin page with TailAdmin tokens and targeted styles; it keeps Payload's built-in
   navigation and its mobile/accessibility behaviour. Use `additive` or `off` to roll back.
2. **Access control is non-negotiable.** Every dashboard query uses `overrideAccess:false`
   with the current principal; the UI can never show what the user may not read.
3. **Degrade, don't crash.** Every data query is guarded; failures become a visible
   warning, never a 500, and never break the native editing flows.
4. **Don't fight Payload's CSS.** The Tailwind dashboard styles are scoped (`.ta-root` /
   `.ta-inline`) and have no global preflight. The global theme is a separate opt-in
   stylesheet gated by `html[data-ta-theme="on"]`, with dark mode following Payload's
   `data-theme` attribute.

See [`docs/admin-ui/`](../../docs/admin-ui/README.md) for the rationale, roadmap, and
usage guide.
