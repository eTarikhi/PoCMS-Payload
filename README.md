# PoCMS-Payload

This repository is now scaffolded as a Payload CMS app in the project root, configured to work with a serverless PostgreSQL database such as Neon or Vercel Postgres.

## Tech stack

- Payload CMS
- Next.js
- PostgreSQL via `@payloadcms/db-postgres`
- Neon / Vercel Postgres compatible connection strings

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and fill in your database credentials:

   ```bash
   cp .env.example .env
   ```

3. Generate Payload types:

   ```bash
   npm run generate:types
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the admin UI:

   ```text
   http://localhost:3000/admin
   ```

## Environment variables

Use one of the supported serverless Postgres connection variables:

```bash
POSTGRES_URL=postgres://username:password@host/dbname?sslmode=require
# or
DATABASE_URL=postgres://username:password@host/dbname?sslmode=require
PAYLOAD_SECRET=replace-with-a-long-random-secret
```

For Vercel Postgres, set `POSTGRES_URL` from the Vercel dashboard.
For Neon, use the connection string provided by Neon and enable SSL if required.

## Notes

The root-level configuration uses the official Payload Postgres adapter and is prepared for use with serverless PostgreSQL providers.

You may also want to run the Payload migrations once the database is ready:

```bash
npm run payload migrate
```
