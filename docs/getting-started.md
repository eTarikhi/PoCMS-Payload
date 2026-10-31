# Getting started

## Prerequisites

- **Node.js 22+** (see `.nvmrc`)
- **pnpm 10+** (`corepack enable pnpm`)
- **PostgreSQL 16+** (local instance, `docker compose up -d postgres`, or a Neon serverless branch)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/eTarikhi/PoCMS-Payload.git
   cd PoCMS-Payload
   ```

2. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```

3. Copy the documented environment template:
   ```bash
   cp .env.example .env
   ```

4. Generate a secure `PAYLOAD_SECRET` and update `POSTGRES_URL` in `.env`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Generate Payload TypeScript types, import map, Drizzle schema, GraphQL schema, and nav icons:
   ```bash
   pnpm run generate:all
   ```

## Core Environment Variables

Every supported variable is documented with purpose, type, format, and examples in [`.env.example`](../.env.example). Minimal local configuration:

```dotenv
NODE_ENV=development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
PAYLOAD_SECRET=replace-with-64-char-hex-secret
POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/pocms

# Optional locally (leave empty to use ./media disk storage and offline email/forms):
BLOB_READ_WRITE_TOKEN=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
```

## Seed Initial Content & Start Development Server

```bash
# Optional: seed portfolio sections, articles, projects, and Contact / Request-CV forms
pnpm run seed

# Start Next.js + Payload dev server
pnpm dev
```

Open:
- Public portfolio: `http://localhost:3000`
- Payload Admin UI: `http://localhost:3000/admin`
- REST API: `http://localhost:3000/api`
- GraphQL API: `http://localhost:3000/api/graphql`

## Key Scripts (`package.json`)

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Next.js + Payload in development mode |
| `pnpm run generate:all` | Generate `payload-types.ts`, `importMap.js`, DB schema, `schema.graphql`, and `nav-icons.css` |
| `pnpm run seed` | Seed portfolio content, globals, and default forms into PostgreSQL |
| `pnpm lint` | Run ESLint across the repository |
| `pnpm run test:int` | Run the Vitest integration & component test suite |
| `pnpm run test:e2e` | Run Playwright E2E + WCAG accessibility tests (uses bundled Chromium or auto-falls back to local Chrome / Edge) |
| `pnpm test` | Run full verification (`tsc --noEmit`, `lint`, `test:int`, `test:e2e`, `playwright --list`) |
| `pnpm run build` | Build optimized production bundle |
