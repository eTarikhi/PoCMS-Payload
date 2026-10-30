# Deployment

## Vercel Deployment (Recommended)

1. Push your branch to GitHub and import the repository in Vercel.
2. Provision **Neon PostgreSQL** and **Vercel Blob** stores (via Vercel Marketplace or standalone).
3. Configure the required production environment variables in Vercel Project Settings (see [`.env.example`](../.env.example) for full details and optional integrations):
   - `PAYLOAD_SECRET` — at least 16 characters (64-char hex recommended; validated fail-fast in production)
   - `POSTGRES_URL` — pooled PostgreSQL connection URI
   - `POSTGRES_URL_NON_POOLING` — direct unpooled PostgreSQL URI (recommended for database maintenance & Mail SSE `LISTEN/NOTIFY`)
   - `NEXT_PUBLIC_SITE_URL` — canonical `https://` origin without trailing slash (e.g., `https://vtarikhi.com`)
   - `BLOB_READ_WRITE_TOKEN` — Vercel Blob read/write token (`vercel_blob_rw_<store_id>_<token>`)
4. Optional production integrations:
   - **Email & Mail Inbox**: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` (webhook target: `POST https://<your-domain>/api/webhooks/resend`), `CONTACT_NOTIFICATION_EMAIL`
   - **Scheduled Jobs**: `CRON_SECRET`
   - **Database Tier-2 & Encrypted Vault**: `NEON_API_KEY`, `DATABASE_BACKUP_SECRET`, `DATABASE_BLOB_READ_WRITE_TOKEN`
   - **Admin Dashboard Widgets**: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `GOOGLE_API_KEY`, `GITHUB_REPOSITORY`, `GITHUB_TOKEN`
5. Deploy!

---

## Docker & Self-Hosted Deployment

### Local Stack via Docker Compose
`docker-compose.yml` orchestrates `postgres:16-alpine` + the `payload` app container:

```bash
cp .env.example .env
docker compose up -d
```

### Standalone Production Container (`Dockerfile`)
`Dockerfile` automatically sets `DOCKER_BUILD=true`, activating `output: 'standalone'` in `next.config.ts` and running `pnpm run generate:all` prior to `pnpm run build`:

```bash
docker build -t pocms-payload .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PAYLOAD_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  -e POSTGRES_URL="postgres://postgres:postgres@host.docker.internal:5432/pocms" \
  -e NEXT_PUBLIC_SITE_URL="http://localhost:3000" \
  pocms-payload
```

---

## Production Checklist

- [ ] `PAYLOAD_SECRET` is a unique 32-byte (64-hex-character) random secret
- [ ] `NEXT_PUBLIC_SITE_URL` matches the live HTTPS domain (no trailing slash)
- [ ] `POSTGRES_URL` (pooled) and `POSTGRES_URL_NON_POOLING` (direct) are configured
- [ ] `BLOB_READ_WRITE_TOKEN` is set for persistent media and private mail attachments
- [ ] `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are set if inbound/outbound mail is enabled
- [ ] GitHub Actions CI (`.github/workflows/ci.yml`) is green before merging to production
