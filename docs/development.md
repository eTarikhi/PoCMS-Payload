# Development and troubleshooting

## Public frontend workflow

```sh
pnpm preview:studio          # sample-content design preview on port 4173
pnpm test:frontend           # database-independent component/query/config tests
pnpm exec tsc --noEmit
pnpm lint
pnpm build:compile           # actual Next compilation, not full production generation
```

Browser checks:

```sh
pnpm exec playwright install chromium
PLAYWRIGHT_BASE_URL=http://localhost:4173 pnpm test:preview
```

A preinstalled Chromium executable can be passed through
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Preview-specific fixture tests do not run against
the production app. See [frontend roadmap](frontend-roadmap.md) for completed work
and release gates.

For the real app, configure `.env` first and run `pnpm dev`. The normal `test:int`
and admin browser suites need an isolated database. Never point tests or seed scripts
at production. Setting `PLAYWRIGHT_BASE_URL` for the normal Playwright config uses
an existing server instead of launching a second Next process.

## Common failures

### Database

Confirm `POSTGRES_URL` is present and targets the intended database. Verify connectivity
using your database provider tools without copying credentials into logs or chat.
`DATABASE_URI` is not the variable used by this config. Read [getting started](getting-started.md)
for the Vercel adapter's loopback-host behavior.

### Media

- Local assets must match Next's configured `localPatterns`.
- Public Vercel Blob origins are allowed by default.
- Additional hosts must be configured in `MEDIA_REMOTE_ORIGINS` as HTTPS origins only.
- Do not put signed URLs, passwords, paths or query strings into that variable.
- Optimization refuses local-network fetches; keep local media behind relative
  `/api/media/file/...` routes rather than enabling arbitrary local-IP optimization.

### CMS errors

The public error boundary offers retry without exposing server exception details.
Inspect server logs privately. There is no production fallback to sample data.

### Cache changes

Content saves/deletes invalidate the shared `portfolio` tag. Homepage, archive,
article and sitemap queries use that content cache. When changing cached view-model
shapes or access semantics, version the cache keys to avoid incompatible old entries.
Validate actual revalidation in the configured Next/Payload application.

## Safe changes

Keep view models independent of Payload runtime objects. Use collection configs as
the source of truth, regenerate artifacts after schema changes, and review migrations
before applying them. Generated artifacts and browser binaries should not be committed.
