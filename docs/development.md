# Development and troubleshooting

## Common development workflow

1. Create a feature branch.

```bash
git checkout -b feature/your-feature
```

2. Start the app locally.

```bash
pnpm dev
```

3. Make changes and test locally.

4. Add migrations when schema changes require them.

```bash
npx payload migrate:create
```

5. Commit and push.

```bash
git add .
git commit -m "Add your feature"
git push origin feature/your-feature
```

6. Open a pull request and deploy after merge.

## Troubleshooting

### Database connection issues

```bash
# Check DATABASE_URI format
# Should look like:
# postgresql://user:password@host:port/dbname

psql $DATABASE_URI -c "SELECT 1"
```

### Build failures

```bash
rm -rf .payload
rm -rf dist

pnpm generate:all
pnpm build
```

### Missing environment variables

```bash
echo $DATABASE_URI
echo $BLOB_READ_WRITE_TOKEN
echo $PAYLOAD_SECRET
```

### Vercel Blob issues

- confirm the token is valid
- check that the token has write permissions
- ensure the variable matches the correct project

## Recommended practices

- keep environment variables local and secret
- use migrations for schema changes
- validate custom collection and field changes before deployment
- review the Payload docs when adding advanced collection logic
