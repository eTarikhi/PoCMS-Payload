# Deployment

## Docker setup

The repository includes a `docker-compose.yml` file for local development and service orchestration.

### Start local services

```bash
docker-compose up
```

Then, in another terminal, run:

```bash
npx payload migrate:fresh
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
   - `DATABASE_URI`
   - `BLOB_READ_WRITE_TOKEN`
   - `PAYLOAD_SECRET`
   - `PAYLOAD_PUBLIC_SERVER_URL`
4. Deploy the application.

## Production environment checklist

Before deployment, verify the following:

- a secure `PAYLOAD_SECRET` is defined
- the database connection string is valid
- the blob token has read/write access
- `PAYLOAD_PUBLIC_SERVER_URL` points to the production domain
- `NODE_ENV` is set appropriately

## Security notes

- Keep `.env.local` out of source control
- Use HTTPS in production
- Rely on provider-managed database security and backups
- Use Payload's built-in auth and access control features
- Configure rate limiting and additional validation as needed
