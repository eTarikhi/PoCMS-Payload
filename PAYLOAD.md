# Payload integration notes

This repository uses **Payload 3.90.2**, Next.js App Router and PostgreSQL through
`@payloadcms/db-vercel-postgres`. It is no longer the blank MongoDB/S3 template.

- Config: `src/payload.config.ts`
- Database connection: `POSTGRES_URL`
- Public origin: `NEXT_PUBLIC_SITE_URL`
- Admin: `/admin`
- REST: `/api/{collection}`
- GraphQL: `/api/graphql`
- Optional media storage: Vercel Blob with `BLOB_READ_WRITE_TOKEN`; local disk otherwise
- Public UI: server components using the Local API with anonymous access enforced

Use [getting started](docs/getting-started.md) and `.env.example` for setup. Do not
run database-reset/seed operations against existing data as part of routine setup.
The current Compose file is a legacy MongoDB recipe and must not be assumed compatible.

## Important version-specific behavior

Payload **v3** Local API operations bypass access control by default. This project's
public reads explicitly set `overrideAccess: false`; trusted seed/admin operations
may deliberately use a bypass. Always check the installed version's documentation,
not only the latest documentation branch.

- [v3.90.2 Local API](https://github.com/payloadcms/payload/blob/v3.90.2/docs/local-api/overview.mdx)
- [v3.90.2 access control](https://github.com/payloadcms/payload/blob/v3.90.2/docs/local-api/access-control.mdx)
- [Frontend roadmap/research](docs/frontend-roadmap.md)

The Studio redesign needs no schema migrations. Rich project case studies and a
plain-text-to-Lexical article migration remain deliberate future content-model work.
