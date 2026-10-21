# Deployment and production validation

## Required environment

Use the hosting provider's secret store:

- `PAYLOAD_SECRET`
- `POSTGRES_URL`
- `NEXT_PUBLIC_SITE_URL`
- `BLOB_READ_WRITE_TOKEN` when using Vercel Blob
- `RESEND_API_KEY` when using transactional email
- `MEDIA_REMOTE_ORIGINS` for additional public HTTPS image origins

See `.env.example`. Older references to `DATABASE_URI` or `PAYLOAD_PUBLIC_SERVER_URL`
do not match this configuration. Never commit real environment files or tokens.

## Release checklist

1. Back up the database and use an isolated staging environment.
2. If the content schema changed, review and apply the corresponding migrations through
   your normal release process. This UI redesign introduced no schema changes.
3. Run `pnpm test:frontend`, TypeScript, lint and the browser suite.
4. Run a **full `pnpm build`** with staging/production services configured. A successful
   `pnpm build:compile` alone is not a deployable full build.
5. Verify uploaded images and configured remote origins through Next's image optimizer.
6. Verify real homepage/archive/article content, HTTP 404s, `/robots.txt` and `/sitemap.xml`.
7. Save/delete content in Payload and verify shared cache revalidation.
8. Test authenticated article Live Preview and transactional email.
9. Verify HTTPS, access controls, backups and durable media storage.

Robots restrictions are crawler hints, not authorization. Public Local API queries
explicitly respect anonymous access controls; admin/API security remains Payload's job.

## Storage

With a Blob token, the configured media collection uses Vercel Blob. Without one,
the storage adapter is disabled and media uses local disk. Ephemeral serverless disks
are not suitable for durable production uploads. Additional image origins must be
explicitly allowlisted; local-network image optimization is disabled.

## Local Docker recipe and database transport

The development Compose recipe uses PostgreSQL 17 with explicit
`DATABASE_ADAPTER=postgres`. Hosted defaults remain the Vercel adapter when this
variable is unset. It is not safe to infer an adapter change from a service hostname.

See [Docker guide](docker.md) for required secrets and persistent-volume safeguards.
The YAML contracts, both adapters and full builds were validated outside Docker;
container startup/networking/image behavior remain unverified because no Docker
engine is available here. This is not a production container/deployment recipe.
