# Overview

PoCMS combines Payload **3.90.2**, Next.js App Router, React and PostgreSQL with a
public Engineer’s Studio portfolio and a customized admin UI.

## Current capabilities

- Work-first portfolio with services, skills, profile, career and credentials
- Project archive with search, categories and an accessible screenshot viewer
- Writing archive with URL-backed search and local/plain-text article pages
- Article reading progress and more-writing recommendations
- Shared recovery/loading states, sitemap and robots metadata
- Payload authentication, roles, REST and GraphQL APIs
- Anonymous access-aware cached Local API reads for the public frontend
- Optional Vercel Blob storage and configured HTTPS image sources
- Database-independent component tests and a standalone sample-content preview

## Content flow

Editors manage collections and the Footer global in `/admin`. Server components call
the Local API, map documents into framework-independent view models, and render the
public UI. Content hooks invalidate a shared cache tag on saves/deletes. The frontend
does not require a client-side GraphQL layer.

The app uses the Vercel PostgreSQL adapter. Loopback connections use `pg`; remote
connections use the adapter's Vercel transport. See [setup](getting-started.md).

## Boundaries

Project case-study bodies, galleries, project-to-skill relationships, rich-text article
migration and contact-form handling are not implemented. The legacy Docker Compose
file is not a supported PostgreSQL recipe. Real database, storage, cache and editor
Live Preview validation remain release gates, separate from sample-content UI checks.

See the [implementation roadmap](frontend-roadmap.md) for delivered work, research
sources and future content-model proposals.
