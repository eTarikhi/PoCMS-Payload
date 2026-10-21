# Engineer’s Studio design preview

Run from the repository root:

```sh
pnpm preview:studio
```

Opens a standalone Vite development server on port **4173**. It renders the same
`StudioHome` and CSS used by the production homepage, using the checked-in legacy
`src/app/(frontend)/data/database.json` sample and local public images. The banner
makes the sample-data status explicit. Some sample details may be outdated.

This preview needs **no database, Payload secret, email credentials, or storage token**.
It is not a Next route, not included in the production app, and never substitutes
sample content for a failed CMS request. `next/image` is replaced with a plain image
adapter in this preview only; production image optimization must still be tested
in the configured Next/Payload environment.

## Browser checks

```sh
PLAYWRIGHT_BASE_URL=http://localhost:4173 pnpm exec playwright test --config previews/studio/playwright.config.ts
```

Install Playwright Chromium first if needed. An existing local executable can be
specified via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Tests cover work navigation, filtering,
mobile horizontal overflow, and an automated axe WCAG A/AA scan. Automated scans do
not replace manual keyboard, screen-reader, or live-CMS testing.

## Production validation still needed

- Configure the environment described in `.env.example` using your normal secure workflow.
- Verify uploaded/remote images in Next's image optimizer and valid image-host configuration.
- Check real CMS content, cache revalidation after saves, and article live preview.
- Confirm contact information and work-authorization copy are current before publishing.

## Preview routes

- `/` — portfolio homepage
- `/projects` — complete project archive with search, categories, and screenshot viewer
- `/articles` — searchable writing archive, using sample titles and excerpts
- `/articles/design-preview` — clearly labeled demonstration body and reading layout
- Unknown paths — the shared article-not-found view (Vite still serves its fallback HTML with HTTP 200; this does not test Next's HTTP 404 behavior)

The first sample writing card opens the demonstration article **in this preview only**.
It is not a claim that the sample article has a local body in your CMS. The production
mapper continues to link locally only when a slug and non-empty body exist.

Writing/archive browser tests live under `previews/studio/tests` so their synthetic
article assertions do not run against the production application.

## Project gallery

`/projects` renders the complete project archive with title/category search and the
existing category filters. On the homepage, “Browse project archive” opens it.
Click a screenshot on either page to open its full image in a modal dialog.
The viewer supports Escape, visible close and backdrop controls, keyboard focus
containment, focus restoration, and background scroll restoration. “Inspect at full width”
lets you scroll tall screenshots inside the viewer; “Fit entire image” restores the overview. It shows only
existing project links and images—not fabricated case-study copy.

## Shareable filters

Archive filters use query parameters, for example:

- `/projects?q=SepiWhite&category=front-end`
- `/articles?q=DevOps`

Typing replaces the current history entry rather than adding an entry per keystroke.
Project-category changes add a history entry, so Back/Forward restores the selected
category. Reloading or copying the URL preserves the view. Unknown category values
fall back to All. “Reset all filters” removes search/category parameters while
preserving unrelated query parameters, URL fragments, and the router history state.

The routes remain statically renderable: the server sends the unfiltered archive,
then the client restores URL filters after hydration. Canonical metadata continues
to point to the base archive route rather than individual filter combinations.

The portfolio cache key is versioned for the new Studio view-model fields so older
cached objects do not hide featured-writing or project further-reading controls.
