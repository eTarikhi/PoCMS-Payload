# Admin UI modernisation

PoCMS ships with Payload 3's admin panel. This folder documents the work to modernise
that interface with the **TailAdmin Free (Next.js)** design system while preserving
Payload's built-in editing, access-control, routing, and responsive navigation behaviour.

## Read in order

1. **[Research — admin UI options](./research-admin-ui-options.md)**
   What Payload lets us customise, six candidate templates/libraries compared, and a
   phased roadmap plus skills/frameworks/tools breakdown.
2. **[TailAdmin Free pilot](./tailadmin-pilot.md)**
   What was built, how to run it, the integration modes (`off` / `additive` /
   `dashboard` / `full`), and how the global theme is safely scoped.
3. **[Roadmap](./roadmap.md)**
   Completed work, remaining manual QA, skills matrix, and risk register.

## Current status

| Mode | `POCMS_ADMIN_UI` | State |
|---|---|---|
| Stock Payload panel | `off` | ✅ available as rollback |
| TailAdmin routes + dashboard strip | `additive` | ✅ available, stock styling retained |
| TailAdmin dashboard in Payload chrome | `dashboard` | ✅ available, no global re-skin |
| TailAdmin dashboard + global TailAdmin theme | `full` | ✅ **default**; applies across admin pages and elements |

`full` restyles Payload's native sidebar instead of replacing it, preserving its grid,
mobile drawer, accessibility, and keyboard behaviour. The TailAdmin palette and targeted
component styling cover login/auth pages, dashboard, collections/globals, edit forms,
settings, tables, navigation, buttons, inputs, popups, drawers, modals, and toasts.

## Quick start

```bash
pnpm dev
# sign in at /admin; the TailAdmin dashboard and global theme are enabled by default
```

Set `POCMS_ADMIN_UI=additive` for the stock look with the pilot surfaces, or
`POCMS_ADMIN_UI=off` to disable the pilot entirely. Use `dashboard` to apply only the
TailAdmin dashboard while retaining Payload's native styling. Restart after changing the
variable. See the [pilot doc](./tailadmin-pilot.md) for all settings.

## Code

Everything lives under [`src/admin-ui/tailadmin/`](../../src/admin-ui/tailadmin/), wired
into [`src/payload.config.ts`](../../src/payload.config.ts) via
`buildTailAdminComponents()`. Unit tests are in
[`tests/int/admin-ui.int.spec.ts`](../../tests/int/admin-ui.int.spec.ts).
