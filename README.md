# PoCMS - Portfolio Content Management System

[![Payload CMS](https://img.shields.io/badge/Payload%20CMS-3.0-blue)](https://payloadcms.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-84.4%25-blue)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon%20PostgreSQL-336791)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000)](https://vercel.com)

This repository is a personal portfolio site, the Next.js 16 App Router port of the `vTarikhi` site, with its content managed in Payload 3.0.
The public site is at `/`, and the editor UI is at `/admin`. The home page reads its content through the Payload Local API and is cached.
Saving content in the admin refreshes the cached home page. See [PAYLOAD.md](PAYLOAD.md) for the sections, the content model, and the caching behaviour.

The frontend lives in `src/app/(frontend)/`: components, lib, styles, and the reference content data. The original `vTarikhi/` folder was removed in Set 8. Its files are in git history at commit `6c9fce5`.

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

- Public site: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`
- REST API: `http://localhost:3000/api`
- GraphQL: `http://localhost:3000/api/graphql`

## Tech stack

| Layer | Technology |
| --- | --- |
| CMS Framework | Payload CMS 3.0 |
| Runtime | Node.js |
| Language | TypeScript (84.4%) |
| Database | Neon PostgreSQL |
| File Storage | Vercel Blob |
| Deployment | Vercel |
| Package Manager | pnpm |
| Containerization | Docker |

## Features

- Portfolio home page: hero, about, services, skills, certificates, projects, articles, and footer
- Payload 3.0 Headless CMS, with the content read through the Local API
- Cached home page, refreshed by `afterChange` and `afterDelete` hooks on each content collection
- Neon serverless PostgreSQL (a `localhost` URL uses a plain `pg` pool)
- Vercel Blob storage for uploads
- Built-in authentication and RBAC
- REST and GraphQL APIs
- Type-safe TypeScript codebase
- Docker support

## What the site contains

The home page has a hero, an about section, services with a hiring call-to-action, skills with progress bars, experience and education, certificates, projects with category filters, articles, and a footer with social and contact links. Every section is edited in the admin, and the list of collections is in [PAYLOAD.md](PAYLOAD.md).

## Deployment use cases

This project is ready for modern deployment patterns and production delivery workflows:

- Deploy the app to Vercel with auto-generated previews for every branch
- Run the stack with Docker Compose for local development and testing
- Connect a Neon PostgreSQL database for serverless, scalable content storage
- Store media assets in Vercel Blob for global delivery and simplified asset management
- Publish a production frontend with secure environment variables and custom domains
- Use a CI/CD-friendly structure that supports staging, preview, and release flows

## Development use cases

The project supports a smooth developer workflow for building and iterating quickly:

- Start locally with `pnpm dev` and iterate on content models in real time
- Add or update collections and custom endpoints from the `src` directory
- Use Payload migrations when changing schema, fields, or database structure
- Test locally with Vitest and browser-level checks before shipping changes
- Maintain a clean docs layout with dedicated guides for setup, API, deployment, and troubleshooting
- Extend the project with custom blocks, pages, and portfolio-specific content models

## License

See [LICENSE](LICENSE).

## Support

- [GitHub Issues](https://github.com/eTarikhi/PoCMS-Payload/issues)
- [Payload CMS Docs](https://payloadcms.com/docs)
- [Payload Community Discord](https://discord.com/invite/payload)
