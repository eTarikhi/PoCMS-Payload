# PoCMS - Portfolio Content Management System

[![Payload CMS](https://img.shields.io/badge/Payload%20CMS-3.0-blue)](https://payloadcms.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-84.4%25-blue)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon%20PostgreSQL-336791)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000)](https://vercel.com)

A modern Portfolio Content Management System built with Payload 3.0 Headless CMS for managing portfolio projects, content, media, and user authentication.

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
- [Admin UI guide](docs/ui-modernization/admin-ui-guide.md): design tokens, Tailwind (`acn:`), Base UI primitives, dashboard widgets, list views
- [Admin UI decisions (ADRs)](docs/ui-modernization/adr/README.md) and [performance budget](docs/ui-modernization/perf-budget.md)
- [Admin accessibility](docs/ui-modernization/a11y.md): the WCAG 2.2 AA gate, the upstream gaps and the manual screen-reader checklist

## Quick access

- Admin panel: `http://localhost:3000/admin`
- Component gallery (admins only): `http://localhost:3000/admin/gallery`
- API: `http://localhost:3000/api`
- GraphQL: `http://localhost:3000/graphql`

## Tech stack

| Layer | Technology |
| --- | --- |
| CMS Framework | Payload CMS 3.9x (Next.js 16) |
| Admin UI | Payload admin + design tokens, Tailwind CSS 4 (`acn:` prefix), Base UI, TanStack Table |
| Runtime | Node.js 22 |
| Language | TypeScript (84.4%) |
| Database | Neon PostgreSQL |
| File Storage | Vercel Blob |
| Deployment | Vercel |
| Package Manager | pnpm |
| Containerization | Docker |

## Features

- Payload 3.9x headless CMS
- Neon serverless PostgreSQL
- Vercel Blob storage
- Authentication with admin and editor roles
- Branded admin: light/dark design tokens, grouped navigation, permission-aware Create menu
- Admin dashboard widgets: content counts, publishing activity, content checks, recent changes
- TanStack Table list views with custom cells; orderable lists with drag-and-drop (no manual order field)
- Tile pickers for colours and icons, an image-source control for uploads vs external URLs
- Drafts, scheduled publishing and Live Preview for articles
- Rich media management: MIME allow-list, focal point, thumbnail/card/OG sizes, a regeneration script, and folders (beta) with a folder browser
- REST and GraphQL APIs
- Type-safe TypeScript codebase
- Accessibility and visual gates in CI (axe on every admin screen, platform-independent visual invariants)
- Docker support

## Content use cases

PoCMS is designed for a wide range of portfolio and content-driven websites. Typical content types include:

- Portfolio homepage sections for hero, intro, featured work, and call-to-action
- Case studies with project summaries, timelines, results, and media galleries
- Services pages for offerings, process steps, and pricing or package descriptions
- Blog or news entries with categories, authors, tags, and featured images
- Testimonials and client feedback blocks for social proof
- About pages with credentials, experience, skills, and resume highlights
- Contact and inquiry content with location, social links, and form CTAs
- Custom collections for certifications, resources, projects, or creative assets

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
