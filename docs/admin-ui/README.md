# Admin UI modernisation

PoCMS ships with Payload 3's stock admin panel. This folder documents the effort to
**replace or significantly customise** that interface with a modern, responsive,
user-friendly design — currently piloted with the **TailAdmin Free (Next.js)** template.

## Read in order

1. **[Research — admin UI options](./research-admin-ui-options.md)**
   What Payload lets us customise, six candidate templates/libraries compared, and a
   per-option phased roadmap plus skills/frameworks/tools breakdown.

2. **[TailAdmin Free pilot](./tailadmin-pilot.md)**
   What was actually built in this repository, how to run it, the integration modes
   (`off` / `additive` / `dashboard` / `full`), and how Tailwind is kept from breaking
   the stock panel.

3. **[Roadmap](./roadmap.md)**
   The phased plan (what is done vs. next), a consolidated skills matrix, and a risk
   register.

## Current status

| Mode | `POCMS_ADMIN_UI` | State |
|---|---|---|
| Stock panel, untouched | `off` | ✅ always available |
| TailAdmin surfaces alongside the stock panel | `additive` | ✅ **default** in this branch |
| TailAdmin replaces the `/admin` dashboard | `dashboard` | ✅ implemented, opt-in |
| TailAdmin sidebar + full re-skin | `full` | ✅ implemented, opt-in |

## Quick start

```bash
pnpm dev
# then visit /admin and /admin/tailadmin
```

Set `POCMS_ADMIN_UI=dashboard` or `POCMS_ADMIN_UI=full` in your environment to promote
the pilot, then restart. See the [pilot doc](./tailadmin-pilot.md) for every knob.

## Code

Everything lives under [`src/admin-ui/tailadmin/`](../../src/admin-ui/tailadmin/), wired
into [`src/payload.config.ts`](../../src/payload.config.ts) via
`buildTailAdminComponents()`. Unit tests are in
[`tests/int/admin-ui.int.spec.ts`](../../tests/int/admin-ui.int.spec.ts).
