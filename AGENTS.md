# Agent guide for PoCMS

Payload CMS 3.9x on Next.js 16 (App Router), PostgreSQL, pnpm. The public site lives in
`src/app/(frontend)`; the admin is Payload's, customised through its extension points.
Read [`docs/ui-modernization/admin-ui-guide.md`](docs/ui-modernization/admin-ui-guide.md) and
[`src/components/admin/README.md`](src/components/admin/README.md) before changing anything under
`src/components/admin` or `src/styles/admin`.

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
- Admin components go in the folder of the Payload slot they plug into (`graphics/`, `actions/`,
  `nav/`, `providers/`, `views/`, `widgets/`, `fields/`), one PascalCase folder per component with
  `index.tsx` as the entry; config paths look like `/components/admin/actions/ThemeToggle#ThemeToggle`.
  Server Components unless state or browser APIs are needed.
- Build them from the elements in `src/components/admin/elements` (Base UI) and `cn()` from
  `src/components/admin/utilities/cn`. Colours come from tokens (`acn:bg-card`,
  `acn:text-muted-foreground`), never hex values in components. There is no shadcn CLI: new
  elements are written in the repository.
- Payload's admin is one route: every client component referenced from the config ships to every
  admin page. Put heavy client code behind a `'use client'` wrapper that uses `next/dynamic`, and
  keep the bundle within `docs/ui-modernization/perf-budget.md`.
- After adding or renaming a component path in the config, run `pnpm generate:importmap`; after
  changing fields or widgets, run `pnpm generate:all`.
- Local API calls made for a user pass `req` (or `user`) and `overrideAccess: false`.
- Custom admin views render `DefaultTemplate` with `permissions`, `locale` and `visibleEntities`
  from `initPageResult` (they are not top-level props; without them the sidebar loses its groups).
- Schema changes are additive. Deploying them to a database without push needs a migration
  (`npx payload migrate:create`). Ambiguous renames cannot be generated non-interactively: write
  those by hand and register them in `src/migrations/index.ts` (without the `.js` extension).
- New admin components get a preview in the component gallery (`/admin/gallery`,
  `views/Gallery/previews.tsx`) and new features an e2e test.
- Accessibility is a gate, not a review: `tests/e2e/a11y.e2e.spec.ts` scans every admin surface in
  both themes. A new screen belongs in its `SURFACES` list. Payload's own unfixed findings are
  allowlisted there by rule and node count, so a Payload upgrade that fixes one fails the suite —
  remove the entry then. The upstream markup and the manual screen-reader checklist are in
  `docs/ui-modernization/a11y.md`.
- Ordered collections are orderable (`orderable: true`, hidden `_order`): no manual order field,
  sorted `_order` in the admin and in `src/app/(frontend)/lib/payload-source.ts`, seeded one
  document at a time. See the guide's "Orderable lists".
- SEO metadata is Payload's SEO plugin (`src/plugins/seo.ts`): the `meta` group on Articles and
  Site settings is optional, and the page metadata prefers it over the document's own fields. Add
  a new entity to `collections`/`globals` only with a matching fallback in `lib/seo.ts`.
- `/sitemap.xml` and `/robots.txt` are Next metadata routes (`src/app/(frontend)/sitemap.ts`,
  `src/app/robots.ts`) whose rules live in `lib/sitemap-entries.ts` — not `lib/sitemap.ts`, because
  Next treats every `sitemap.*` file inside `app/` as a route. `robots.ts` must stay at the app
  root: the file convention does not match route groups. The sitemap lists only pages that exist,
  so the same "has a slug and a body" rule as the article route applies.
- The database is only changed by migrations (`push: false`), and `onInit` refuses to serve a
  database with no schema: `src/lib/database-readiness.ts` reads `to_regclass` for the core tables
  and the history in `payload_migrations`, then throws a message naming `pnpm migrate`. Code that
  adds a migration keeps its name in `src/migrations/index.ts`; that list is what the check compares
  against. A new core table belongs in `CORE_TABLES` there.
- Media uses Payload's beta folders (`folders: true` on the collection). The folder collection is
  hidden, so its schema changes appear in generated files and migrations like any collection; the
  seed files images into folders after clearing `media`. The folder drawer's `<div type="button">`
  and unlabelled controls are fixed in `AdminDomFixes/folders.ts`, not with CSS-only tricks.
- Admin DOM fixes Payload's config cannot express live in `providers/AdminDomFixes`, one module per
  upstream component with the markup it repairs in its comment. They only fill in what is missing,
  so an upgrade that ships the fix wins; add a unit test in `tests/int/admin-dom-fixes.int.spec.ts`.
