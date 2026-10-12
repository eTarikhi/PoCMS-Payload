# `src/admin-ui` — Payload admin-panel UI extensions

This module holds everything that customises the **Payload admin panel**. It is
self-contained on purpose: nothing outside `src/admin-ui` imports from it except
`src/payload.config.ts` (three lines), so the pilot can be enabled, promoted or removed
with a single environment variable.

The first (and currently only) integration is the **TailAdmin Free** pilot in
[`tailadmin/`](./tailadmin/).

## Entry points

| File | Purpose |
|---|---|
| `tailadmin/config.ts` | Builds the `admin.components` fragment for the selected mode. Imported by `payload.config.ts`. Node-safe (no React/CSS). |
| `tailadmin/paths.ts` | Route constants (`/tailadmin`, `/tailadmin/ui-kit`). |
| `tailadmin/index.ts` | Public, config-safe barrel. Import from here. |

## Layout

```text
tailadmin/
├── config.ts, paths.ts, index.ts      # wiring + constants
├── styles/                            # tailadmin.css (scoped Tailwind) + payload-bridge.css
├── lib/                               # cn() + pure formatting helpers
├── data/                              # server-only Local-API queries + pure nav/quick-action builders
├── icons.tsx                          # TailAdmin icon names → lucide-react
├── ui/                                # primitives (button, badge, avatar, dropdown, table, alert, card)
├── context/, layout/                  # sidebar state + TailAdmin app shell
├── blocks/                            # dashboard widgets + UI-kit gallery
├── views/                             # root views (/tailadmin, /tailadmin/ui-kit, /admin override)
├── nav/                               # afterNavLinks + Nav replacement
├── dashboard/                         # beforeDashboard KPI strip
└── providers/                         # theme-bridge provider (mode full)
```

## Guiding principles

1. **Additive first.** The default `additive` mode adds surfaces without replacing the
   stock panel. Replacement modes are opt-in and reversible.
2. **Access control is non-negotiable.** Every query uses `overrideAccess:false` with the
   current principal; the UI can never show what the user may not read.
3. **Degrade, don't crash.** Every data query is guarded; failures become a visible
   warning, never a 500, and never break the stock dashboard.
4. **Don't fight Payload's CSS.** Tailwind is scoped (`.ta-root` / `.ta-inline`), has no
   global preflight, and its dark mode follows Payload's `data-theme` attribute.

See [`docs/admin-ui/`](../../docs/admin-ui/README.md) for the full rationale, roadmap and
usage guide.
