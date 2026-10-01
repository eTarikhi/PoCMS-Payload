# Overview

PoCMS is a modern portfolio content management system powered by Payload 3.0. It provides a flexible headless CMS experience for managing portfolio projects, content blocks, media, and authentication.

## Key features

- Payload 3.0 Headless CMS
- Neon Serverless PostgreSQL support
- Vercel Blob storage
- Vercel deployment workflow
- Built-in user authentication and role-based access control
- Media optimization with focal points and resizing
- REST and GraphQL API support
- TypeScript-first development workflow
- Docker-ready environment for local and production setup

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

## Project goals

This codebase is designed to give you a strong starting point for a portfolio website or content-heavy marketing site that needs:

- structured content authoring
- a simple admin UI
- flexible API access for frontend applications
- production-friendly deployment options

## Typical workflow

1. Configure the CMS and environment variables.
2. Define collections and content models in the `src` folder.
3. Add projects, media, and custom blocks from the admin dashboard.
4. Use the REST or GraphQL API to power a frontend or custom app.
5. Deploy through Vercel or a Docker-based setup.
