# Article page: technical specification

Status: **approved (§11). D-A2 was revised to plain text, and D-A7 no longer applies as a result.** No runtime code is changed by this document. Implementation follows the same set-by-set approval workflow as the vTarikhi migration (see `docs/migration/03-refactoring-specification.md`, §6).

Date: 2026-10-09. Scope: the root Payload app in this repository, branch `arena/33b19b08-pocms-payload`.

---

## 0. Assumptions and open questions

- **"Modern dark-themed blog template" is not named, and that is intentional (D-A4, approved).** This spec does not copy a specific template. It applies the reading-layout conventions common to dark blog themes: a narrow text column, a generous line height, a clear heading scale, a reading-progress bar, and a visible metadata row. §8 is the reference.
- **The homepage is already dark.** The body background is `#0d0f17` with `#e7e7e7` text. The article page therefore *extends* the existing palette and typography. It does not introduce a second theme.
- **Article cards keep linking out (D-A1, approved).** Homepage cards continue to open LinkedIn or Medium in a new tab. The current `Articles` collection holds a title, an excerpt, an optional description, an image, and an external `link`. An internal article page still needs a stable URL key, and the body text (the existing plain-text `description`, D-A2 revised). §3 adds the slug. Articles with a body also get a smaller "Read on this site" link to the internal page (D-A10, approved).

---

## 1. Goals and non-goals

### Goals
1. A route `/articles/[slug]` that renders one article with the site's own header, navigation, and footer.
2. **Strict global consistency.** The homepage and the article page render the *same* `Navigation`, `Footer`, `BackToTop`, and `BootstrapClient` components, from one module. No copies, no per-page variants.
3. Typography and colors come from the homepage's existing tokens (`main.css` and `layout.tsx`). The reading layer adds spacing and measure only.
4. Readability: body contrast of at least WCAG AA (4.5:1), a 65–75 character measure, and a line height of about 1.75.
5. Content comes from Payload through the existing cache and tag (`portfolio`). Saving an article refreshes it in the same way as the homepage (§6).

### Non-goals (this spec)
- An article index page (`/articles`). It can follow in a later set.
- Comments, newsletter capture, related-article algorithms, or an author profile page.
- Draft preview. Published articles only.
- Changing the existing homepage visuals. The only homepage change is the navigation link format (§4.2).

---

## 2. Current state (verified in the repository)

| Area | Fact | Source |
|---|---|---|
| Body background | `#0d0f17` (`!important`) | `styles/main.css` l.18 |
| Body text | `#e7e7e7`; muted `#ddd`, `#cfc4ad` | `styles/main.css` l.22, 39, 145 |
| Brand accents | primary `#da9100`, secondary `#ffc448`, light `#fafafb`, dark `#12141d` | `styles/main.css` l.3–6 |
| Borders | `#34495e` | `styles/main.css` l.66 |
| Font | Open Sans, weights 400, 500, 600, 700, `display: swap` | `layout.tsx` |
| Theme color | `#da9100` | `layout.tsx` (`viewport`) |
| Navigation links | in-page anchors `#about`, `#skill`, `#service`, `#project`, `#contact`, `#home` | `components/layout/Navigation.tsx` |
| Footer links | `social.url`, `profile.url`, `contact.url \|\| '#'`, `copyright.url` | `components/layout/Footer.tsx` |
| Articles section | every card links out (`article.link`, `target="_blank"`) | `components/sections/ArticlesSection.tsx` |
| Articles collection | `title`, `excerpt`, `description`, `featured`, `category`, `publishedAt`, `readTime`, `image`, `imageUrl`, `link`. **No slug, no body.** | `collections/Articles.ts` |
| Rich text | `@payloadcms/richtext-lexical` 3.90.2 is installed, and `lexicalEditor()` is the global editor. Not used by the article page (D-A2 revised). | `payload.config.ts`, `package.json` |
| Seed | 6 articles, with `title`, `excerpt`, and `link`. None has a `description`. | `seed/articles.ts` |
| Page composition | `Navigation`, `Hero`, `main`, `Footer`, `BackToTop`, `BootstrapClient`, and `JsonLd` are all rendered in `(frontend)/page.tsx` | `app/(frontend)/page.tsx` |

### Contrast audit (computed, WCAG 2.x relative luminance)

| Pair | Ratio | Result |
|---|---|---|
| `#e7e7e7` on `#0d0f17` (body text) | 15.47:1 | AAA |
| `#ffffff` on `#0d0f17` (headings) | 19.13:1 | AAA |
| `#ddd` on `#0d0f17` (muted) | 14.08:1 | AAA |
| `#cfc4ad` on `#0d0f17` (quote text) | 11.07:1 | AAA |
| `#ffc448` on `#0d0f17` (links) | 12.06:1 | AAA |
| `#da9100` on `#0d0f17` (accent) | 7.32:1 | AAA |
| **`#ffffff` on `#da9100` (current `btn-primary`)** | **2.61:1** | **Fails AA (needs 4.5:1)** |
| **`#0d0f17` on `#da9100` (proposed CTA text)** | **7.32:1** | **Passes AAA** |

**Finding F-A1.** The homepage's `btn-primary` buttons use white text on amber, which fails AA. They are the Hero button (`Hero.tsx`), the Services, Articles, and Certificates buttons, and the Certificates "View" button. The article page must not copy that pairing. The homepage fix is out of scope here and is a separate change (D-A6, approved).

---

## 3. Content model changes

Changes to `collections/Articles.ts`. Existing fields are kept.

| Field | Type | Notes |
|---|---|---|
| `slug` | `text`, `unique`, `index`, `required` | URL key. Generated from `title` in a `beforeValidate` hook when empty (lowercase, ASCII, hyphens, max 80 characters). Editable. Must be unique. |
| `description` | `textarea` (existing) | **The article body (D-A2 revised).** Plain text. Paragraphs are separated by a blank line. It is not required, and the internal page needs it (§5.1). Admin hint: "Article body. Separate paragraphs with a blank line." |
| `link` | `text` | Kept and still `required`. It is the card's main link (D-A1, approved). |
| `readTime` | `number` | Kept. The admin hint remains "minutes". It is not computed from the body in this spec. |
| `status` | — | Not added. Articles without a `description` are not published as pages (§5.1). |

**Migration.** Set B adds the `slug` backfill (a one-time script in `src/seed/` that uses the same slug function) and plain-text `description` content for the six seeded articles. Payload pushes the schema change on the next start. The DB unique index on `slug` fails if two rows share a title, so the backfill appends `-2`, `-3`, and so on.

---

## 4. Shared chrome: one source for navigation and footer

### 4.1 Single module

Create `src/app/(frontend)/components/layout/SiteChrome.tsx`. It renders, in order:

```
<Navigation />
{children}              // page content (the homepage <main>, or the article)
<Footer footer={...} />  // guarded: renders only when footer data exists
<BackToTop />
<BootstrapClient />
```

- `SiteChrome` is the **only** place these components are composed. `page.tsx` for the homepage and `articles/[slug]/page.tsx` both use it.
- It takes `footer: FooterContent | null` and `children`. It has no route-specific props. This is the consistency guarantee: a change in `SiteChrome` changes every page at once.
- `Hero` stays page-specific. It is not part of `SiteChrome`.

### 4.2 Navigation links work from any route

Change the `Navigation` and `Footer` anchors from `#about` to `/#about` (and likewise `/#skill`, `/#service`, `/#project`, `/#contact`, `/#home`). On the homepage, `/#about` is a same-page hash navigation. On the article page, it returns to the homepage at the section. The brand link already uses `/`.

- Scroll-spy (`data-bs-spy` on the homepage `<main>`) is unchanged on the homepage.
- The collapse-on-click behavior (`hideNavbarCollapse`) is unchanged. It runs before the navigation.
- Decision D-A3 asks you to approve this link format. It is the recommended option.

### 4.3 Verification for consistency

`tests/int/` gets one test: render `SiteChrome` inside the homepage and inside the article page with the same footer fixture, then compare the normalized HTML of the `nav` and `footer` subtrees. The test fails on any difference. The expected result is identical markup.

---

## 5. Routing, data, and components

### 5.1 Route and data

```
src/app/(frontend)/articles/[slug]/
├── page.tsx            composition only (SiteChrome + article components)
├── not-found.tsx       "Article not found" with a link back to /
└── opengraph-image.tsx optional, out of scope for Set B
```

- `generateStaticParams()` reads every article that has a `slug` and a `description` through the cached data layer. The articles are prerendered at build time, the same way the homepage is.
- `dynamicParams` stays at its default (`true`). A new article saved after the build renders on the first request and is then cached.
- An unknown slug, or an article with no `description`, calls `notFound()`.
- `getCachedArticleBySlug(slug)` lives in `lib/articles.ts`. It uses `unstable_cache` with the key `['portfolio-article', slug]` and the tag `portfolio`. The existing `portfolioAfterChange` and `portfolioAfterDelete` hooks already call `revalidateTag('portfolio', 'max')`, so no new hook is needed.

### 5.2 Components

All paths are under `src/app/(frontend)/`.

```
components/
├── layout/
│   ├── SiteChrome.tsx           NEW   shared shell (§4.1)
│   └── ...                      existing: Navigation, Footer, BackToTop, BootstrapClient, Hero
└── article/                     NEW
    ├── ArticleLayout.tsx        server  <article> wrapper, measure, spacing
    ├── ArticleHeader.tsx        server  category, title, excerpt, date, readTime
    ├── ArticleMeta.tsx          server  date and readTime row (reuses the homepage format)
    ├── ArticleCover.tsx         server  wraps the existing ui/CoverImage.tsx
    ├── ArticleBody.tsx          server  plain-text paragraphs from `description` (§5.3)
    ├── ArticleFooterNav.tsx     server  "Back to articles" and "Originally published at" links
    └── ReadingProgress.tsx      client  thin amber bar at the top, scroll-driven
```

`ReadingProgress` is the only new client component. It follows `Navigation.tsx`: it listens to `scroll`, updates a `transform: scaleX()` value, and removes its listener on unmount. It is disabled under `prefers-reduced-motion`.

`ArticleBody` does not use the homepage's `TypingEffect`, scroll reveal, or any animation.

### 5.3 Plain-text body rendering (D-A2 revised)

- The body is the article's `description`, plain text. `ArticleBody` splits it on blank lines (`/\n\s*\n/`) and renders each non-empty chunk as a `<p>`.
- Text is rendered as React text, so it is escaped. No HTML is accepted or rendered.
- Single line breaks inside a paragraph are kept as spaces. No headings, lists, links, code, or images are parsed from the body in this version.
- The Lexical renderer (`RichText`) is not used by this feature. It stays installed for other collections.
- Because the body has no headings, there is no table of contents and no heading anchors.

### 5.4 Mapping

`lib/article-mappers.ts` converts a Payload document to an `ArticleDetail` view model. The components receive only that view model, the same as the homepage sections:

```ts
type ArticleDetail = {
  slug: string
  title: string
  excerpt: string
  category: 'articles' | 'others' | null
  publishedDisplay: string   // "October 9, 2026"
  readTimeDisplay: string    // "5 min"
  coverUrl: string | null
  paragraphs: string[]          // split from `description` by blank lines (§5.3)
  externalLink: string | null
}
```

`publishedDisplay` and `readTimeDisplay` reuse `lib/format.ts`, so the dates and read times match the homepage.

---

## 6. Caching and revalidation

- The article route is prerendered like the homepage. It has no `headers()`, `cookies()`, or `payload.auth()` calls.
- It shares the single `portfolio` tag (D-A8, approved). Saving any article, or the header, footer, or other collections, refreshes it. This is slightly broader than necessary. The trade-off is one tag and no per-article bookkeeping.
- The known gap from Set 6 still applies. A seed or a direct database change does not refresh the cache until the next build or a save in `/admin`.

---

## 7. SEO and structured data

- `generateMetadata` for each article: `title` (the article title), `description` (the excerpt), `openGraph.images` (the cover, absolute URL), and `alternates.canonical` (`https://vtarikhi.com/articles/{slug}`, following D-5 for the base URL).
- JSON-LD `BlogPosting` on the article page: `headline`, `description`, `datePublished`, `author` (the existing `Person` from `buildPersonJsonLd`), `image`, `mainEntityOfPage`. It is rendered beside the existing `JsonLd` Person block and uses the same builder pattern from `lib/seo.ts`.
- `sitemap`: out of scope here. `next-sitemap` is in the dependency list but not configured, so the sitemap is a separate change.

---

## 8. Design tokens and reading layer

Colors and fonts are reused from the homepage. The reading layer adds only the values in the last column of this table. Every value in that column is a proposal to check during implementation.

| Element | Homepage token (existing) | Reading-layer value (new, proposed) |
|---|---|---|
| Page background | `#0d0f17` | unchanged |
| Body text | `#e7e7e7`, Open Sans 400 | Open Sans 400, `1.125rem` (18px), line-height `1.75` |
| Title (`h1`) | `#fff`, Open Sans 700 | Open Sans 700, `2.5rem` on desktop, `1.875rem` on mobile, `letter-spacing: -0.01em` |
| Measure | container (Bootstrap) | text column `max-width: 68ch`, centered. Cover image up to 1140px wide. |
| Paragraph spacing | `margin-bottom` default | `margin: 0 0 1.25em` |
| Links (navigation, footer, "Originally published at") | `#ffc448` | same color, `text-decoration-thickness: 0.08em`, `text-underline-offset: 0.2em`. Hover `#da9100`. |
| Category badge | — | `background: #da9100`, text `#0d0f17` (AAA, §2) |
| Primary CTA | `btn-primary` (white on amber, fails AA) | text `#0d0f17` on `#da9100` (7.32:1) |
| Reading progress | — | `#da9100`, height 3px, fixed top |
| Dividers | `#34495e` | same |

Rows for headings, blockquotes, inline code, code blocks, and image captions were removed in D-A2 revised, because the body is plain text.

**Styles file.** `styles/article.css`, new, imported from `articles/[slug]/page.tsx`. Every rule is scoped under `.article-page`, so `main.css` is not touched.

---

## 9. Accessibility

- One `<h1>` (the title). The body is paragraphs only, so it has no headings.
- The `<article>` element wraps the body. `<time dateTime="…">` is used for the date.
- Images have `alt` text from the media record. An image without `alt` fails the content check in §10.
- Focus styles are kept from Bootstrap. The shared layout gets one `Skip to content` link (D-A9, approved). It is visually hidden until it receives focus.
- The reading-progress bar is `aria-hidden="true"`.
- All text colors meet AA. The CTA uses dark text on amber (§2, F-A1).
- Respect `prefers-reduced-motion`: no progress animation.

---

## 10. Testing plan

| Test | Type | Layer |
|---|---|---|
| `slugify` and uniqueness suffix (`-2`, `-3`) | unit | `lib/articles` |
| `mapArticleDoc` → `ArticleDetail` (dates, read time, cover URL, missing `description` returns `notFound`, blank-line splitting) | unit | `lib/article-mappers` |
| `buildBlogPostingJsonLd` output (required fields, absolute URLs) | unit | `lib/seo` |
| `ArticleBody` splits plain text into paragraphs, drops empty chunks, and escapes HTML in the text | component (jsdom) | `components/article` |
| `ReadingProgress` updates `scaleX` on scroll, removes its listener on unmount, and is hidden under reduced motion | component (jsdom) | `components/article` |
| `SiteChrome` produces identical `nav` and `footer` markup on the homepage and the article page, and the skip link is present on both | integration | `tests/int/` |
| Each navigation link resolves to `/#section` on the article page | integration | `tests/int/` |
| `/articles/{slug}` prerenders for each seeded article, and an unknown slug returns 404 | build and smoke | `next build` and `next start` |
| Contrast of the tokens in §8 | script | `tests/int/` (pure computation) |

The existing Vitest setup covers all of these. The Playwright e2e spec stays unchanged, as before, because the browser download is blocked in this sandbox.

---

## 11. Decisions for approval

| ID | Question | Recommendation |
|---|---|---|
| **D-A1** | Should homepage article cards link to the internal page (`/articles/{slug}`), or keep linking out to LinkedIn and Medium? | **APPROVED: keep linking out** to LinkedIn and Medium. Cards are unchanged. Consequence: the internal page needs its own entry point (D-A10). |
| **D-A2** | Body source: a new `body` rich-text field, or reuse the existing `description` textarea? | **REVISED, approved: plain-text `description`.** This reverses the earlier approval of a rich-text field. The body has no headings, lists, links, or code. §5.3 describes the plain-text rendering. |
| **D-A3** | Navigation links: `/#section` everywhere (§4.2), or per-page link sets? | **APPROVED: `/#section` everywhere.** One format, no per-page branching. |
| **D-A4** | Which dark blog template should the reading layout follow? | **APPROVED: common dark-blog reading conventions**, as written in §8. No specific template. |
| **D-A5** | Cover image: reuse `image` (upload) with `imageUrl` kept as a fallback? | **APPROVED: reuse `image`.** Keep `imageUrl` as a fallback for the legacy seed. |
| **D-A6** | Fix the homepage's white-on-amber buttons (F-A1) now, or in a separate change? | **APPROVED: separate change.** It touches the homepage visuals, which this spec does not change. |
| **D-A7** | Need an image block in the rich-text body in the first version? | **Moot.** The body is plain text (D-A2 revised). |
| **D-A8** | Per-article cache tags, or the single `portfolio` tag (§6)? | **APPROVED: single `portfolio` tag.** It is simpler and the content volume is small. |
| **D-A9** | Add a skip-to-content link to the shared layout? | **APPROVED: yes.** It is cheap and improves keyboard use across both pages. |
| **D-A10** | Entry point for the internal article page, now that cards link out (D-A1). Options: (a) reachable by direct URL only, (b) a secondary "Read on this site" link on each card, (c) drop the internal route. | **APPROVED: (b).** Each card keeps its main link out. Articles with a body also get a smaller "Read on this site" link to `/articles/{slug}`. |

---

## 12. Implementation sets

Each set ends with a stop for approval, the same as the migration.

| Set | Scope | Gate |
|---|---|---|
| **A. Shared chrome** | `SiteChrome.tsx`. Replace `page.tsx` composition with it. `/#section` links in `Navigation` and `Footer`. The skip link (D-A9). The consistency test in §4.3. The homepage must look and behave the same, apart from the skip link, which is hidden until focused. | Approval, then a visual parity check against the current homepage. |
| **B. Content and routing** | `slug` field. The slug backfill script. Plain-text `description` content for the six seeded articles. `/articles/[slug]` with `generateStaticParams` and `notFound`. `lib/articles.ts` and the mappers. The "Read on this site" link on each article card with a body (D-A10). | Approval, then the content review of the six article bodies. |
| **C. Article components** | `components/article/*`, `styles/article.css`, `ReadingProgress`. Unit and component tests. | Approval, then a visual review of one article against §8. |
| **D. SEO and QA** | `generateMetadata`, `BlogPosting` JSON-LD, the contrast script, the full test run, `next build`, and a production smoke test of `/` and `/articles/{slug}`. | Approval to close the feature. |

Set A is the smallest change and the one that protects the "identical navigation and footer" requirement. It should be approved first.

---

## 13. Code structure, after all sets

```
src/app/(frontend)/
├── layout.tsx                         unchanged (fonts, global CSS, metadata)
├── page.tsx                           homepage: SiteChrome + Hero + main sections
├── articles/[slug]/
│   ├── page.tsx                       article: SiteChrome + ArticleLayout
│   └── not-found.tsx
├── components/
│   ├── layout/SiteChrome.tsx          NEW (Set A)
│   ├── layout/...                     existing; links changed to /#section (Set A)
│   ├── article/                       NEW (Set C)
│   └── sections/...                   existing; ArticlesSection keeps its external main link (D-A1) and adds a "Read on this site" link for articles with a body (D-A10) (Set B)
├── lib/
│   ├── articles.ts                    NEW (Set B): getCachedArticleBySlug, getArticleSlugs, slugify
│   ├── article-mappers.ts             NEW (Set B): ArticleDetail
│   ├── seo.ts                         extended (Set D): buildArticleMetadata, buildBlogPostingJsonLd
│   └── ...                            existing
└── styles/
    ├── main.css                       unchanged
    └── article.css                    NEW (Set C), scoped to .article-page

src/collections/Articles.ts            + slug (Set B). description is reused as the body.
src/seed/articles.ts                   + description text for six articles (Set B)
tests/int/                             + SiteChrome parity, + nav link format, + contrast, + mappers, + components
```

---

## 14. Out of scope

- An article index page, comments, newsletter, search, and related articles.
- A sitemap (see §7).
- Changes to `main.css` and the homepage visuals, including the F-A1 button fix (D-A6).
- Draft preview.
- Any change to the existing `vTarikhi` history or the migration docs.

## 15. Set B notes (implementation status)

Set B is implemented and awaiting approval. Set C (reading layer) does not start until it is approved.

- **Delivered.** `slug` field (unique, indexed, sidebar) and `articleSlugBeforeValidate` hook. Backfill script `pnpm backfill:article-slugs`, run against the local database: all 6 seeded articles now have slugs. `fetchArticleBySlug` and `fetchPublishedArticleSlugs`. `getCachedArticleBySlug` and `getCachedArticleSlugs` (tag `portfolio`). `mapArticleDetail`, `splitArticleBody`, `pagePath` on `ArticleItem`. Interim `/articles/[slug]` markup inside `SiteChrome`. "Read on this site" link on cards that have a page.
- **Open decision.** The six seeded articles still have no `description`, so none has a page yet. Their cards show no "Read on this site" link. Body text must come from the user. Nothing has been invented.
- **Known framework limitation (Next.js 16.3.8, this app).** `notFound()` thrown from a matched route returns HTTP 404 with an empty `__next_error__` HTML shell. The not-found UI is only in the RSC payload, so it renders after hydration and is blank without JavaScript. This reproduces in dev and production, with or without a segment `not-found.tsx`, a group-level one, or `experimental.globalNotFound`. It is tracked upstream (vercel/next.js #99287, #62228). Unmatched URLs render correctly. Options are listed in the Set B report.
- **Verified.** tsc, eslint (0 errors), vitest (109 passed), `next build --webpack` (0). Hook behaviour checked through the Local API: suffixes, slug kept on title edit, cleared slug regenerated, own id excluded. A temporary article rendered at `/articles/[slug]` (200, paragraphs, shared chrome) and was then deleted.
- **Build note.** The default Turbopack build fails on the sandbox's Google Font mock (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`). `next build --webpack` passes.

## 16. Set C notes (implementation status)

Set C is implemented and awaiting approval. Set D (SEO and QA) does not start until it is approved.

- **Delivered.** `components/article/` (ArticleLayout, ArticleHeader, ArticleMeta, ArticleCover, ArticleBody, ArticleFooterNav, ReadingProgress). `styles/article.css`, with every rule scoped under `.article-page`. The page is now SiteChrome plus `<main class="article-page">` plus `ArticleLayout`. `ArticleDetail` gained `publishedAt` (ISO, for `<time dateTime>`) and `coverAlt` (from the media record, falling back to the title).
- **Deviation from §5.3, for the record.** `ArticleBody` receives `paragraphs` from the mapper, instead of splitting the raw text itself. The split lives in one place, `lib/article-page.ts`, and the mapper's output is the view model (§5.4). Empty paragraphs are still dropped in the component.
- **Deviation from §9, for the record.** No `<nav>` or `<footer>` elements are used inside the article. Those are reserved for `SiteChrome`, so the navigation and footer stay the only ones on the page.
- **Reduced motion.** `ReadingProgress` renders nothing when `prefers-reduced-motion: reduce` matches (test plan §10). It reads the preference with `useSyncExternalStore`.
- **Verified.** tsc 0, eslint 0 errors, vitest 121 passed. `next build --webpack` 0. Headless screenshots at 1366px and 390px show no horizontal overflow. The measure is about 700px (68ch), the title is 40px on desktop and 30px on mobile, the body is 18px, and the cover is 1140px wide on desktop.
- **Placeholder article in the local database.** `layout-check-placeholder-text` ("Layout check (placeholder text)") exists only so the layout can be reviewed. Its body is placeholder text, not article content. Delete it before the feature closes, or when the real bodies are added.
- **Still open from Set B.** The six seeded articles still have no body text. The 404 limitation is unchanged.

## 17. Set D notes (SEO and QA)

Set D is implemented and awaiting approval to close the feature.

- **Metadata.** `buildArticleMetadata` in `lib/seo.ts`: title is the article title, description is the excerpt, the canonical URL is `{site}/articles/{slug}`, and Open Graph type is `article` with `publishedTime`. The image is the cover, made absolute, or the profile photo when there is no cover. `generateMetadata` in the article route returns `noindex` for a missing article. Next replaces the root `openGraph` and `twitter` objects, so both are set in full.
- **Structured data.** `buildBlogPostingJsonLd` gives `headline`, `description`, `datePublished`, `author` (the home page's Person, without a nested `@context`), `image`, `url`, and `mainEntityOfPage`. Every URL is absolute. The script is rendered beside the home page's Person block, outside `SiteChrome`.
- **Contrast.** `tests/int/article-contrast.int.spec.ts` computes WCAG ratios for every text pair. It also checks that the colors exist in `article.css`. Results: body 15.47:1, title 19.13:1, excerpt 14.08:1, meta 11.07:1, links 12.06:1, link hover 7.32:1, badge and CTA text 7.32:1. The homepage's white-on-amber button is 2.61:1 and is not used on the article page (F-A1, separate change, D-A6).
- **Verified.** tsc 0. eslint 0 errors (the 7 warnings were there before this set). vitest 142 passed across 12 files. `next build --webpack` 0. A production smoke test (`next start`) checked the homepage (Person JSON-LD only, no canonical, unchanged), the placeholder article (200, canonical, Open Graph, `BlogPosting`), a seeded article with no body (404, `noindex`), and an unknown slug (404, `noindex`).
- **Known gaps, for the record.** The homepage has no canonical link, because §7 covers articles only. The sitemap is out of scope (§7). The missing-article HTML is still the Next.js 16.3.8 empty shell from Set B. Playwright e2e was not run, because the browser download is blocked in this sandbox, as in earlier sets.
- **Before closing the feature.** Delete the placeholder article `layout-check-placeholder-text`. Settle the six seeded article bodies and the 404 option (Set B, §15).

## 18. Closing status

Approved on 2026-10-09. Sets A to D are committed (`dc2a51e`, `7334519`, `8a8e079`, `992d61a`).

- **Placeholder removed.** The layout-check article `layout-check-placeholder-text` was deleted from the local database. A restart did not clear the cached page, because Next keeps rendered pages on disk in `.next/server/route-cache`, and the fetch cache is in `.next/cache/fetch-cache`. Both were removed, and the URL now returns 404. A deletion made from a separate script does not invalidate the cache (the Set 6 gap). Deletions made in `/admin` should, through the `afterDelete` hook. That path is not tested end to end. The six seeded articles are unchanged.
- **Still open, not decided by the approval.** (1) Body text for the six seeded articles. Until it is supplied, none has a page, and the cards show no "Read on this site" link. (2) The missing-article response. Option A accepts Next.js 16.3.8's empty HTML shell with the correct 404 status (§15). Option B returns a 200 page with `noindex`.
