# Admin UI primitives (shadcn `base-vega`, Base UI, Tailwind prefix `acn`)

These components are the admin's design-system primitives (ADR 0001). They are adapted from the
shadcnstudio **AdminCN** template (MIT, © 2026 shadcn/studio), which uses the shadcn/ui
`base-vega` style (MIT, © shadcn) on top of `@base-ui/react`.

Changes from upstream:

- Every Tailwind class carries the admin prefix: `acn:flex`, `acn:hover:bg-muted` (ADR 0002). The
  conversion used shadcn's own `transformTwPrefixes` transformer, the code path `shadcn add` runs
  when `components.json` sets `tailwind.prefix`.
- Imports point at `@/components/admin/lib/utils` and `@/components/admin/ui/*`.
- Colours, radius, spacing and type come from `src/styles/admin/{tokens,admin-ui}.css`, so the
  components follow Payload's light/dark theme.

Adding a component:

```bash
pnpm dlx shadcn@latest add <component>   # components.json applies the prefix and the paths
pnpm check:tw-prefix                      # verifies that every class is prefixed and produces CSS
```

Code copied by hand from the shadcn docs or AdminCN must be prefixed too; `pnpm check:tw-prefix`
lists anything that was missed. Keep edits to these files minimal so upstream updates stay easy to
apply.
