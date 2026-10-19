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
   - Optional, for the admin dashboard widgets: `GOOGLE_API_KEY` (Page speed), `VERCEL_TOKEN` and
     `VERCEL_PROJECT_ID` (Site traffic, Deployments), `GITHUB_TOKEN` (CI status of a private
     repository). See `.env.example` for how to create each one.
4. Deploy the application.

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
