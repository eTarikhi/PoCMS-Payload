# Deployment

## Docker setup

The repository includes a `docker-compose.yml` file for local development and service orchestration.

### Start local services

```bash
cp .env.example .env   # set PAYLOAD_SECRET
docker compose up
```

The `payload` service runs `pnpm dev`, which pushes the schema to the `postgres` service on first
start. To load the portfolio content, run in another terminal:

```bash
docker compose exec payload pnpm seed
```

After that, open the admin UI at:

```text
http://localhost:3000/admin
```

### Docker notes

The docker environment is intended to provide:

- PostgreSQL connectivity
- application service startup
- hot-reload friendly development
- isolated local environment

## Vercel deployment

1. Push the project to GitHub.
2. Import the repo in Vercel.
3. Add environment variables in the Vercel dashboard:
   - `POSTGRES_URL`
   - `BLOB_READ_WRITE_TOKEN`
   - `PAYLOAD_SECRET`
   - `NEXT_PUBLIC_SITE_URL`
   - `RESEND_API_KEY`
4. Deploy the application.

### Environment variables per environment (Production and Preview)

Vercel builds each deployment with the variables of its environment: pushes to the production
branch use **Production**, every other branch (and pull request) uses **Preview**. Variables set
only for Production are missing from Preview builds.

- Tick **Production** and **Preview** for `PAYLOAD_SECRET` and `POSTGRES_URL` (Project > Settings >
  Environment Variables), or give Preview its own values (for example a separate database branch,
  so preview deployments never write to production data). Redeploy after changing them.
- `PAYLOAD_SECRET` signs the admin's login tokens: use a long random value
  (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and keep it the same
  for all deployments that share a database, or existing sessions stop working.
- The build no longer fails when they are missing (`src/app/(frontend)/lib/payload-env.ts`): the
  home page and the article pages are then not prerendered, the build log says
  `PAYLOAD_SECRET and POSTGRES_URL are not set`, and requests fail with an error that names the
  missing variables until they are set. With the variables in place, the home page and the
  article pages are prerendered as before.

## Production environment checklist

Before deployment, verify the following:

- a secure `PAYLOAD_SECRET` is defined
- the database connection string is valid
- the blob token has read/write access
- `NEXT_PUBLIC_SITE_URL` points to the production domain
- `NODE_ENV` is set appropriately

## Security notes

- Keep `.env` and `.env*.local` out of source control (only `.env.example` is committed)
- Use HTTPS in production
- Rely on provider-managed database security and backups
- Use Payload's built-in auth and access control features
- Configure rate limiting and additional validation as needed
