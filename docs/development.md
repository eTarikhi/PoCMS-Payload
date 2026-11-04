# Development and troubleshooting

## Standard Development Workflow

1. Create or switch to your working branch:
   ```bash
   git checkout -b feature/your-feature
   ```
2. Regenerate Payload artifacts whenever you modify collections, globals, fields, or admin components:
   ```bash
   pnpm run generate:all
   ```
   *(Note: Generated artifacts such as `src/payload-types.ts`, `src/payload-generated-schema.ts`, `src/app/(payload)/admin/importMap.js`, `schema.graphql`, and `src/styles/admin/nav-icons.css` are gitignored and generated automatically in CI/builds.)*
3. Start the dev server:
   ```bash
   pnpm dev
   ```
4. Verify types, lint rules, and tests before pushing:
   ```bash
   pnpm exec tsc --noEmit
   pnpm lint
   pnpm run test:int
   ```

## Troubleshooting

### PostgreSQL connection issues
Verify `POSTGRES_URL` in `.env` uses a valid PostgreSQL URI:
```bash
# Example local connection test:
psql "$POSTGRES_URL" -c "SELECT 1"
```

### Stale Next.js / Payload generated artifacts
If TypeScript or Admin UI components fail to resolve after a schema change:
```bash
rm -rf .next
pnpm run generate:all
pnpm exec tsc --noEmit
```

### Vercel Blob token startup error
`@payloadcms/storage-vercel-blob` validates non-empty tokens against `vercel_blob_rw_<store_id>_<random_string>`. For local development without cloud storage, leave `BLOB_READ_WRITE_TOKEN=` **empty** in `.env` so Payload stores uploads in `./media`.

### Emergency Custom Code Recovery
If an HTML/JS/CSS snippet saved in `Site settings -> Codes` (`custom-code`) ever disrupts public pages, set both kill-switches in your environment and redeploy/restart:
```dotenv
DISABLE_CUSTOM_CODE_INJECTION=true
NEXT_PUBLIC_DISABLE_CUSTOM_CODE=true
```
