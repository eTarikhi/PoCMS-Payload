# Project structure

```text
src/
  app/
    (frontend)/
      (studio)/
        page.tsx                # Studio homepage
        projects/page.tsx       # searchable project archive
        articles/page.tsx       # searchable writing archive
        loading.tsx             # scoped away from article HTTP 404s
      articles/[slug]/          # local article + missing-article view
      components/studio/        # shared public design system and archives
      components/article/       # reading layout and live preview
      lib/                      # view models, mappers, Payload reads, cache and SEO
      styles/                   # scoped Studio and reading styles
      error.tsx                 # shared recovery boundary
      feed.xml/route.ts         # tag-aware writing RSS feed
      sitemap.ts                # public archives and readable local articles
    robots.ts                   # must be at App Router root
    (payload)/                  # Payload admin and API routes
  collections/                  # authoritative CMS content definitions
  globals/Footer.ts             # footer/contact/hiring global
  access/                       # roles and permissions
  payload.config.ts             # CMS, PostgreSQL, storage and editor configuration
  utilities/media-origins.ts     # Next image-origin validation
previews/studio/                 # standalone Vite/sample-data preview and browser fixtures
scripts/integration/            # guarded disposable-database fixture bootstrap
tests/int/                      # components, query contracts, config and guarded DB test
tests/live/                     # real Next/Payload integration browser tests
tests/e2e/                      # public checks and guarded admin UI login smoke tests
```

## Content model boundaries

Header/About are singleton-like collections; Footer is a global. Projects contain
titles, categories, images, optional slugs and outbound links. They do **not** yet
have rich case-study bodies, outcomes, galleries or skill relationships. Article bodies
are plain-text `description` fields. Only articles with a slug and non-empty body get
a local page; others link to their original publication.

The public app reads Payload's Local API from server components with anonymous access
control enforced. It does not need Apollo or a browser-side GraphQL query layer.
See [roadmap and research](frontend-roadmap.md) for deliberate future extensions.
