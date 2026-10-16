# Agent guide for PoCMS

Payload CMS 3.9x on Next.js 16 (App Router), PostgreSQL, pnpm. The public site lives in
`src/app/(frontend)`; the admin is Payload's, customised through its extension points.
Read [`docs/ui-modernization/admin-ui-guide.md`](docs/ui-modernization/admin-ui-guide.md) before
changing anything under `src/components/admin` or `src/styles/admin`.

## Commands

```bash
pnpm dev                 # http://localhost:3000 (admin at /admin)
pnpm generate:all        # types, Drizzle schema, GraphQL schema, import map (never edit these by hand)
pnpm typecheck && pnpm lint && pnpm check:tw-prefix && pnpm check:contrast
pnpm test:int            # Vitest + Local API (needs POSTGRES_URL)
pnpm test:e2e            # Playwright (starts or reuses the dev server)
```

CI runs all of the above, regenerates the generated files and fails if they differ.

## Rules

- Stay on Payload 3.9x APIs. Don't replace Payload's routing, forms, list state or access control.
- Admin Tailwind classes always carry the `acn:` prefix (`acn:flex`, `acn:hover:bg-muted`). There
  is no Preflight; Tailwind scans only `src/components/admin`.
- Use the primitives in `src/components/admin/ui` (Base UI, shadcn `base-vega`) and `cn()` from
  `src/components/admin/lib/utils`. Colours come from tokens (`acn:bg-card`,
  `acn:text-muted-foreground`), never hex values in components.
- Payload's admin is one route: every client component referenced from the config ships to every
  admin page. Put heavy client code behind a `'use client'` wrapper that uses `next/dynamic`, and
  keep the bundle within `docs/ui-modernization/perf-budget.md`.
- After adding or renaming a component path in the config, run `pnpm generate:importmap`; after
  changing fields or widgets, run `pnpm generate:all`.
- Local API calls made for a user pass `req` (or `user`) and `overrideAccess: false`.
- Schema changes are additive. Deploying them to a database without push needs a migration
  (`npx payload migrate:create`).
- New admin features get an e2e test; accessibility checks use `@axe-core/playwright` with the
  WCAG 2.2 AA tags (see `tests/e2e/ui-kit.e2e.spec.ts`).
