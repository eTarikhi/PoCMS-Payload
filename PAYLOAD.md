# Portfolio site on Payload CMS

This app runs the public portfolio site at `/` and the Payload admin at `/admin`, on one Next.js 16 App Router
project. Editors change the content in the admin, and the home page refreshes after each save.

## What the site shows

The home page, in this order:

1. Navigation bar (fixed; it gets an extra class after 300px of scrolling)
2. Hero: name, rotating job titles, and the "Request CV" link
3. About: summary, experience, work permit, interests, and images
4. Services, with the hiring call-to-action
5. Skills (progress bars), experience, and education
6. Certificates
7. Projects, with category filters
8. Articles
9. Footer: social links, profile links, contact details, and copyright
10. "Back to top" button

The page also includes a `Person` JSON-LD block, built from the header and footer content.

## Content model

The content collections are edited in the admin. `Users` holds the admin accounts and is not content.

| Slug              | What it holds                                                          | Notes                         |
| ----------------- | ---------------------------------------------------------------------- | ----------------------------- |
| `header`          | Name, job titles, CV link, profile picture                             | Single document (`limit: 1`)  |
| `about`           | About text, experience summary, work permit, interests, images         | Single document               |
| `skills`          | Label, value (percentage), colour, and group (`frontend` or `backend`) | Sorted by `order`             |
| `experiences`     | Job title, company (with location), dates                              | Sorted by `order`             |
| `educations`      | Degree, institution, location, dates                                   | Sorted by `order`             |
| `certificates`    | Title, issuer, issue date, link, image                                 | Sorted by issue date          |
| `articles`        | Title, excerpt, publish date, read time, link, image                   | Newest first                  |
| `services`        | Category, icon (`iconFont`), bullet points                             | Sorted by `order`             |
| `projects`        | Title, image, categories, links                                        | Sorted by `order`             |
| `media`           | Uploaded images                                                        | Used by the collections above |
| `footer` (global) | Social links, profile links, contact details, copyright, hiring CTA    | Single document               |

Icons are chosen from lists. The list of Font Awesome icons that the site can draw is in
`src/components/portfolio/icons.tsx`. Adding a new icon means adding it to that file first.

## Running it locally

Set these environment variables in `.env`:

- `PAYLOAD_SECRET`: required. Secures Payload auth.
- `POSTGRES_URL`: required. A PostgreSQL connection string. A `localhost` address uses a plain `pg` pool.
- `BLOB_READ_WRITE_TOKEN`: needed only for uploads to Vercel Blob. Without it, the admin still works, but new uploads fail.
- `NEXT_PUBLIC_SITE_URL`: optional. The public site URL used for metadata and JSON-LD. Defaults to `https://vtarikhi.com`.

Then run:

```bash
pnpm install
pnpm dev          # dev server on http://localhost:3000
pnpm seed         # fills an empty database with the portfolio content
```

Create the first admin user at `/admin`. Seeding does not create a user.

## Caching and updates

The home page is static. It reads its content through `getCachedPortfolioContent()`
(`src/lib/portfolio/cache.ts`), which is cached under the `portfolio` tag.

Every content collection and the footer global run `afterChange` and `afterDelete` hooks
(`src/lib/portfolio/hooks.ts`). Each hook marks the `portfolio` tag stale. After a save, the next request can
still show the old content. The request after that shows the new content.

A failed cache update is logged and does not fail the save.

The hooks also run for changes made outside a Next request, such as `pnpm seed`. There the cache refresh cannot run, so it is logged and the page keeps its cached content until the next build or deploy, or until a document is saved in the admin.

Because the home page is prerendered, `pnpm build` needs a reachable database.

## Checks

```bash
pnpm exec tsc --noEmit    # type check
pnpm lint                 # ESLint (warnings are in template files)
pnpm test:int             # Vitest: mappers, components, sections, cache, and the database API
```

`tests/e2e/frontend.e2e.spec.ts` still expects the template page. It fails until it is updated.
