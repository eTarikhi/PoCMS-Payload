# PoCMS - Portfolio Content Management System

[![Payload CMS](https://img.shields.io/badge/Payload%20CMS-3.90.2-blue)](https://payloadcms.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-84.4%25-blue)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon%20PostgreSQL-336791)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000)](https://vercel.com)

A modern Portfolio Content Management System built with Payload 3.90.2 Headless CMS for managing portfolio projects, content, media, and user authentication.

## Documentation

This project documentation is split across multiple files for easier maintenance:

- [Documentation index](docs/README.md)
- [Overview](docs/overview.md)
- [Getting started](docs/getting-started.md)
- [Project structure](docs/project-structure.md)
- [API reference](docs/api.md)
- [Deployment](docs/deployment.md)
- [Development and troubleshooting](docs/development.md)
- [Contributing](docs/contributing.md)

## Quick access

- Admin panel: `http://localhost:3000/admin`
- API: `http://localhost:3000/api`
- GraphQL: `http://localhost:3000/api/graphql`

## Tech stack

| Layer            | Technology         |
| ---------------- | ------------------ |
| CMS Framework    | Payload CMS 3.90.2 |
| Runtime          | Node.js            |
| Language         | TypeScript (84.4%) |
| Database         | Neon PostgreSQL    |
| File Storage     | Vercel Blob        |
| Deployment       | Vercel             |
| Package Manager  | pnpm               |
| Containerization | Docker             |

## Features

- Payload 3.90.2 Headless CMS
- Neon serverless PostgreSQL
- Vercel Blob storage
- Built-in authentication and RBAC
- Rich media management
- REST and GraphQL APIs
- Type-safe TypeScript codebase
- Legacy Docker template (see deployment caveat)

## Engineer’s Studio frontend

```sh
pnpm install --frozen-lockfile
pnpm preview:studio
```

Review the sample-content design on port **4173**, without a database. The preview
is separate from the real Payload app and is clearly labeled. It includes the
homepage, searchable project/writing archives, screenshot viewer and article demo.

- [Preview instructions](previews/studio/README.md)
- [Implementation roadmap and Payload research](docs/frontend-roadmap.md)
- [Isolated integration testing](docs/integration-testing.md)
- [Real CMS setup](docs/getting-started.md)

For local checks: `pnpm test:frontend`, `pnpm exec tsc --noEmit`, `pnpm lint`, and
`pnpm build:compile`. Full production generation, local media optimization, cache
revalidation and authenticated Live Preview have also been tested against a disposable
PostgreSQL database. Follow the integration guide to reproduce; remote providers and
real staging still require deployment-specific validation.

Existing writing is available at `/feed.xml` as RSS, with local article links when
available and original publication links otherwise. No schema migration is required.

Projects currently have images/categories/outbound links, not rich case-study bodies.
Article bodies are plain text. Rich case studies, testimonials, contact forms and
project-to-skill relationships are potential extensions, not implemented features.

**Docker note:** the existing Compose file is a legacy MongoDB template, not a validated
PostgreSQL setup for the current config. Read the deployment caveat before using it.

## License

See [LICENSE](LICENSE).

## Support

- [GitHub Issues](https://github.com/eTarikhi/PoCMS-Payload/issues)
- [Payload CMS Docs](https://payloadcms.com/docs)
- [Payload Community Discord](https://discord.com/invite/payload)
