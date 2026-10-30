# Contributing

## Development standards

- Write clear, typed TypeScript and follow the existing Next.js 16 + Payload CMS 3 patterns.
- Keep frontend styles (`src/app/(frontend)`) and Payload Admin styles (`src/components/admin` with `acn:` Tailwind prefix) isolated.
- Do not commit gitignored generated files (`src/payload-types.ts`, `src/payload-generated-schema.ts`, `src/app/(payload)/admin/importMap.js`, `schema.graphql`, `src/styles/admin/nav-icons.css`); run `pnpm run generate:all` locally instead.
- Add or update Vitest integration tests (`tests/int/*.int.spec.ts`) and/or Playwright E2E specs (`tests/e2e/*.e2e.spec.ts`) for behavioral changes.

## Pre-PR Verification

1. Fork or branch from the target branch.
2. Run codegen, typecheck, lint, and tests:
   ```bash
   pnpm run generate:all
   pnpm exec tsc --noEmit
   pnpm lint
   pnpm run test:int
   ```
3. Commit with a clear, descriptive message and open a pull request — `.github/workflows/ci.yml` will automatically run typechecking, linting, Vitest integration tests, production bundle compilation, and Playwright E2E + accessibility checks.
