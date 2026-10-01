# Getting started

## Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- Git
- Access to a PostgreSQL-compatible database such as Neon
- A Vercel Blob token and Payload secret for full functionality

## Installation

1. Clone the repository:

```bash
git clone https://github.com/eTarikhi/PoCMS-Payload.git
cd PoCMS-Payload
```

2. Install dependencies:

```bash
pnpm install --no-prod
```

3. Approve build dependencies when prompted:

```bash
pnpm approve-builds
```

4. Generate configuration files:

```bash
pnpm generate:all
```

5. Copy the example environment file:

```bash
cp .env.example .env.local
```

6. Update the file with your local values.

## Environment variables

Create a `.env.local` file in the project root with the following values:

```env
# Payload CMS
PAYLOAD_SECRET=your-super-secret-key-here

# Database (Neon PostgreSQL)
DATABASE_URI=postgresql://user:password@ep-your-db.neon.tech/dbname

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token

# Node Environment
NODE_ENV=development

# Application
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3000
```

### Generate a secure Payload secret

```bash
openssl rand -base64 32
```

## Database setup

### Fresh database

```bash
npx payload migrate:fresh
```

### Create a custom migration

```bash
npx payload migrate:create
```

## Start the app

```bash
pnpm dev
```

Then open:

- Admin panel: `http://localhost:3000/admin`
- API: `http://localhost:3000/api`

Follow the on-screen setup instructions to create your first admin user.

## Useful scripts

```bash
# Development
pnpm dev

# Build / production
pnpm build
pnpm start

# Database
npx payload migrate
npx payload migrate:fresh
npx payload migrate:create
```
