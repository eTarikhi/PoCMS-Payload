# ADR 0001 — Base UI (shadcn `base-vega`) as the primitive library

- **Status:** Accepted (2026-10-16, decision D1). Amended by [ADR 0009](0009-payload-native-component-layout.md):
  the primitives are now elements in `src/components/admin/elements/<Name>/index.tsx`, maintained
  in the repository; `components.json` and the shadcn CLI are gone.
- **Context:** New admin surfaces (dashboard widgets, list tables, cells, custom fields, the UI kit)
  need accessible primitives. shadcnstudio's current repositories, including the AdminCN template
  the design is based on, use the shadcn `base-vega` style, which is built on `@base-ui/react`.
  Six Radix packages are installed in this repository but no code imports them.
- **Decision:** Use `@base-ui/react` through shadcn-style components in
  `src/components/admin/ui/*`. The components are adapted from AdminCN (MIT) and shadcn/ui (MIT),
  with the Tailwind prefix applied by shadcn's own prefix transformer (see ADR 0002).
  `components.json` records the style (`base-vega`), aliases and prefix so `shadcn add` produces
  matching code later.
- **Consequences:**
  - Payload keeps owning document controls, drawers, modals and toasts inside Payload flows
    (`@payloadcms/ui`); shadcn primitives are used for new surfaces only.
  - Base UI popups render in a portal on `<body>`; their z-index is aligned with Payload's
    `--z-popup` (60) in `src/styles/admin/admin-ui.css`.
  - The unused Radix packages are removed in the final dependency clean-up.
- **Alternatives considered:** Radix (`new-york`) — installed but unused, and no longer the org
  standard.
