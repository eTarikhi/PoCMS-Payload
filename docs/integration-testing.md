# Isolated PostgreSQL and real-app verification

These tests write data. Use a **new disposable database**, not your normal development,
staging or production database. No destructive reset or production seed is required.

## Requirements and safety gates

- A running local PostgreSQL server, reachable through `127.0.0.1` or `localhost`.
- A newly created database whose name ends in `_integration`, for example
  `pocms_studio_integration`. Create it using your PostgreSQL administration tools.
- `POCMS_INTEGRATION=1` and privately generated random `PAYLOAD_SECRET` and
  `INTEGRATION_ADMIN_PASSWORD` values. Never use production secrets.
- Chromium installed with `pnpm exec playwright install chromium`, or an existing
  executable supplied through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

The bootstrap, database test and admin browser suites refuse to initialize/write
without the explicit environment guard. The guard rejects remote hosts and other
names, but is not a substitute for checking that the database really is disposable.
Browser integration tests additionally require a loopback application URL. Do not
run two browser suites concurrently: they modify the same fixtures and cache.

Store the configuration privately in ignored `.env.integration.local`, mode `0600`:

```dotenv
POCMS_INTEGRATION=1
POSTGRES_URL=postgres://YOUR_LOCAL_ROLE@127.0.0.1:55432/pocms_studio_integration
PAYLOAD_SECRET=YOUR_PRIVATELY_GENERATED_RANDOM_SECRET
INTEGRATION_ADMIN_PASSWORD=YOUR_PRIVATELY_GENERATED_RANDOM_PASSWORD
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The example role, port and placeholders must match **your own** isolated server.
Next does not automatically read this custom filename. Source it explicitly in each
terminal; do not print it to logs or commit it:

```sh
set -a
. ./.env.integration.local
set +a
pnpm integration:bootstrap
pnpm test:int
pnpm test:integration:email  # captures provider boundary; sends no external email
pnpm build
pnpm start --hostname 0.0.0.0
```

Run the bootstrap in the normal non-production environment so Payload can initialize
the schema in this **new empty database**. It creates the existing schema, default
roles, and clearly labeled header/project/article/admin/footer fixtures. It neither
resets the database nor applies a migration to a pre-existing deployment. Repeated
runs do not duplicate the fixture records; the integration footer is deliberately
updated. Keep the same private admin password when reusing this database.

In a second terminal, source the same file and run:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:integration:browser
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e
```

`test:e2e` includes the UI login/dashboard/user-list/create-form smoke tests and the
three public browser checks. It no longer deletes/recreates a hardcoded user. The
bootstrap admin is `studio-admin@example.test`; its password is private environment
configuration. These credentials are only for this disposable database.

## What the real-app suite verifies

- Actual generated homepage and article content, not the standalone Vite adapter.
- HTTP 404 for a nonexistent article. The Studio loading boundary is scoped to a
  route group so it cannot flush a streaming HTTP 200 before `notFound()` resolves.
- Anonymous public reads and denied anonymous content creation.
- Real Next optimization of local public images and authenticated media uploads.
- Homepage save revalidation, with the original header restored afterward.
- New article discovery without rebuilding; old/new slug cache behavior; trash,
  restoration and permanent deletion; archive, sitemap and RSS invalidation.
- Authenticated dashboard/article editor and actual Live Preview iframe messages.
- Unsaved title changes do not persist; an empty draft body shows the saved article.
- Populated upload relationships in Live Preview.
- XML parsing, content type, subscription link and actual content in `/feed.xml`.

Temporary media/articles are cleaned up in `finally` blocks. The bootstrap fixtures
remain for inspection. An interrupted test may still leave disposable test records;
inspect or remove the **whole dedicated database** with your own administration
procedures when finished. Never generalize cleanup commands to another database.

Standalone bootstrap cache warnings (`static generation store missing`) are expected:
it runs outside Next. The HTTP suites exercise real hooks inside the production app
and prove revalidation separately. Stop `next start` before replacing `.next` with
another build.

## Environment validated in this execution

PostgreSQL **18.4**, Payload **3.90.2**, Next **16.3.8**, Node **22**, and Chromium.
The loopback database was provisioned using npm-distributed PostgreSQL binaries
outside the repository; there is no new runtime dependency or committed binary.
The local database uses loopback-only trust authentication for disposable fixtures;
this is **not a production authentication recommendation**.

Remote Vercel Blob, remote HTTPS image fetches, email delivery, hosted staging and
real-person content review remain separate deployment checks. A successful local
integration run does not certify those services. The legacy Mongo Compose template
is unchanged and is not an integration setup for this adapter.

See [transactional email](email.md) for the new guarded password-reset lifecycle
check, trusted reset origins and the distinction between capture and real delivery.
