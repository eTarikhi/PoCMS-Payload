# Article page: technical specification

Status: **proposal, awaiting approval.** No runtime code is changed by this document. Implementation follows the same set-by-set approval workflow as the vTarikhi migration (see `docs/migration/03-refactoring-specification.md`, §6).

Date: 2026-10-09. Scope: the root Payload app in this repository, branch `arena/33b19b08-pocms-payload`.

---

## 0. Assumptions and open questions

- **"Modern dark-themed blog template" is not named.** This spec does not copy a specific template. It applies the reading-layout conventions common to dark blog themes: a narrow text column, a generous line height, a clear heading scale, a reading-progress bar, and a visible metadata row. If you have a specific template in mind, send its URL or a screenshot and §5 will be adjusted. Decision D-A4.
- **The homepage is already dark.** The body background is `#0d0f17` with `#e7e7e7` text. The article page therefore *extends* the existing palette and typography. It does not introduce a second theme.
- **Article content is not yet internal.** The current `Articles` collection holds a title, an excerpt, an optional description, an image, and an external `link` (LinkedIn, Medium). An internal article page needs a stable URL key and a body. §3 adds both. Decisions D-A1 and D-A2.

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
| Rich text | `@payloadcms/richtext-lexical` 3.90.2 is installed, and `lexicalEditor()` is the global editor | `payload.config.ts`, `package.json` |
| Renderer | `RichText` and `JSXConvertersFunction` are exported from `@payloadcms/richtext-lexical/react` | installed package `index.d.ts` |
| Seed | 6 articles, none with a body | `seed/articles.ts` |
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

**Finding F-A1.** The homepage's `btn-primary` buttons use white text on amber, which fails AA. They are the Hero button (`Hero.tsx`), the Services, Articles, and Certificates buttons, and the Certificates "View" button. The article page must not copy that pairing. The homepage fix is out of scope here and should be a separate change (§11, decision D-A6).

---

## 3. Content model changes

Changes to `collections/Articles.ts`. Existing fields are kept.

| Field | Type | Notes |
|---|---|---|
| `slug` | `text`, `unique`, `index`, `required` | URL key. Generated from `title` in a `beforeValidate` hook when empty (lowercase, ASCII, hyphens, max 80 characters). Editable. Must be unique. |
| `body` | `richText` (Lexical) | Article body. Rendered by `RichText` with the converters in §5.3. Required for the internal page. |
| `coverImage` | `upload` → `media` | Reuse the existing `image` field instead of adding a new one. Decision D-A5: keep `image` and `imageUrl` as is. |
| `link` | `text` | Kept. Its label changes to "Originally published at" (optional, no longer `required`). Decision D-A1. |
| `readTime` | `number` | Kept. The admin hint remains "minutes". It is not computed from the body in this spec. |
| `status` | — | Not added. Articles without a `body` are not published as pages (§5.1). |

**Migration.** Set B adds the `slug` backfill (a one-time script in `src/seed/` that uses the same slug function) and body content for the six seeded articles. Payload pushes the schema change on the next start. The DB unique index on `slug` fails if two rows share a title, so the backfill appends `-2`, `-3`, and so on.

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

- `generateStaticParams()` reads every article that has a `slug` and a `body` through the cached data layer. The articles are prerendered at build time, the same way the homepage is.
- `dynamicParams` stays at its default (`true`). A new article saved after the build renders on the first request and is then cached.
- An unknown slug, or an article with no body, calls `notFound()`.
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
    ├── ArticleBody.tsx          server  RichText + converters (§5.3)
    ├── ArticleFooterNav.tsx     server  "Back to articles" and "Originally published at" links
    └── ReadingProgress.tsx      client  thin amber bar at the top, scroll-driven
```

`ReadingProgress` is the only new client component. It follows `Navigation.tsx`: it listens to `scroll`, updates a `transform: scaleX()` value, and removes its listener on unmount. It is disabled under `prefers-reduced-motion`.

`ArticleBody` does not use the homepage's `TypingEffect`, scroll reveal, or any animation.

### 5.3 Rich text rendering

- Use `RichText` from `@payloadcms/richtext-lexical/react`.
- Converters: the default set, plus a custom `heading` converter that adds an anchor `id` (for example, `h2` gets `id="section-slug"`) so the reader can link to it.
- No raw HTML. Images in the body use `next/image` through a small block converter. Decision D-A7 covers whether a block converter is needed in the first version.

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
  body: SerializedEditorState   // passed to ArticleBody only
  externalLink: string | null
}
```

`publishedDisplay` and `readTimeDisplay` reuse `lib/format.ts`, so the dates and read times match the homepage.

---

## 6. Caching and revalidation

- The article route is prerendered like the homepage. It has no `headers()`, `cookies()`, or `payload.auth()` calls.
- It shares the single `portfolio` tag. Saving any article, or the header, footer, or other collections, refreshes it. This is slightly broader than necessary. The trade-off is one tag and no per-article bookkeeping. Decision D-A8 asks whether you want per-slug tags.
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
| Headings | `#fff`, Open Sans 700 | `h2` 2rem, `h3` 1.5rem, `h4` 1.125rem, margin-top `2.5em`, `letter-spacing: -0.01em` |
| Measure | container (Bootstrap) | text column `max-width: 68ch`, centered. Cover image up to 1140px wide. |
| Paragraph spacing | `margin-bottom` default | `margin: 0 0 1.25em` |
| Links | `#ffc448` | same color, `text-decoration-thickness: 0.08em`, `text-underline-offset: 0.2em`. Hover `#da9100`. |
| Blockquote | — | `border-left: 3px solid #da9100`, background `rgba(218, 145, 0, 0.08)`, text `#cfc4ad`, padding `1rem 1.25rem` |
| Inline code | — | `background: #12141d`, text `#ffc448`, radius 4px |
| Code block | — | `background: #12141d`, border `1px solid #34495e`, `overflow-x: auto` |
| Image caption | — | `#ddd`, `0.875rem`, centered |
| Category badge | — | `background: #da9100`, text `#0d0f17` (AAA, §2) |
| Primary CTA | `btn-primary` (white on amber, fails AA) | text `#0d0f17` on `#da9100` (7.32:1) |
| Reading progress | — | `#da9100`, height 3px, fixed top |
| Dividers | `#34495e` | same |

**Styles file.** `styles/article.css`, new, imported from `articles/[slug]/page.tsx`. Every rule is scoped under `.article-page`, so `main.css` is not touched.

---

## 9. Accessibility

- One `<h1>` (the title). Body headings start at `h2`.
- The `<article>` element wraps the body. `<time dateTime="…">` is used for the date.
- Images have `alt` text from the media record. An image without `alt` fails the content check in §10.
- Focus styles are kept from Bootstrap. Skip link: the layout gets one `Skip to content` link (decision D-A9, optional).
- The reading-progress bar is `aria-hidden="true"`.
- All text colors meet AA. The CTA uses dark text on amber (§2, F-A1).
- Respect `prefers-reduced-motion`: no progress animation.

---

## 10. Testing plan

| Test | Type | Layer |
|---|---|---|
| `slugify` and uniqueness suffix (`-2`, `-3`) | unit | `lib/articles` |
| `mapArticleDoc` → `ArticleDetail` (dates, read time, cover URL, null `body` returns `notFound`) | unit | `lib/article-mappers` |
| `buildBlogPostingJsonLd` output (required fields, absolute URLs) | unit | `lib/seo` |
| `ArticleBody` renders headings with `id`s, links, lists, blockquote, and code | component (jsdom) | `components/article` |
| `ReadingProgress` updates `scaleX` on scroll, removes its listener on unmount, and is hidden under reduced motion | component (jsdom) | `components/article` |
| `SiteChrome` produces identical `nav` and `footer` markup on the homepage and the article page | integration | `tests/int/` |
| Each navigation link resolves to `/#section` on the article page | integration | `tests/int/` |
| `/articles/{slug}` prerenders for each seeded article, and an unknown slug returns 404 | build and smoke | `next build` and `next start` |
| Contrast of the tokens in §8 | script | `tests/int/` (pure computation) |

The existing Vitest setup covers all of these. The Playwright e2e spec stays unchanged, as before, because the browser download is blocked in this sandbox.

---

## 11. Decisions for approval

| ID | Question | Recommendation |
|---|---|---|
| **D-A1** | Should homepage article cards link to the internal page (`/articles/{slug}`), or keep linking out to LinkedIn and Medium? | **Internal**, with "Originally published at" as a secondary link. Keep external links only for articles with no body. |
| **D-A2** | Body source: a new `body` rich-text field, or reuse the existing `description` textarea? | **New `body` rich-text field.** `description` is plain text and can't hold headings, lists, or code. |
| **D-A3** | Navigation links: `/#section` everywhere (§4.2), or per-page link sets? | **`/#section` everywhere.** One format, no per-page branching. |
| **D-A4** | Which dark blog template should the reading layout follow? | Send a link or screenshot. Until then, §8 is used as is. |
| **D-A5** | Cover image: reuse `image` (upload) with `imageUrl` kept as a fallback? | **Reuse `image`.** Keep `imageUrl` as a fallback for the legacy seed. |
| **D-A6** | Fix the homepage's white-on-amber buttons (F-A1) now, or in a separate change? | **Separate change.** It touches the homepage visuals, which this spec does not change. |
| **D-A7** | Need an image block in the rich-text body in the first version? | **No**, in the first version. Add it later if needed. |
| **D-A8** | Per-article cache tags, or the single `portfolio` tag (§6)? | **Single `portfolio` tag.** It is simpler and the content volume is small. |
| **D-A9** | Add a skip-to-content link to the shared layout? | **Yes.** It is cheap and improves keyboard use across both pages. |

---

## 12. Implementation sets

Each set ends with a stop for approval, the same as the migration.

| Set | Scope | Gate |
|---|---|---|
| **A. Shared chrome** | `SiteChrome.tsx`. Replace `page.tsx` composition with it. `/#section` links in `Navigation` and `Footer`. The consistency test in §4.3. The homepage must look and behave the same. | Approval, then a visual parity check against the current homepage. |
| **B. Content and routing** | `slug` and `body` fields. The slug backfill script. The body content for the six seeded articles. `/articles/[slug]` with `generateStaticParams` and `notFound`. `lib/articles.ts` and the mappers. | Approval, then the content review of the six article bodies. |
| **C. Article components** | `components/article/*`, `styles/article.css`, `RichText` converters, `ReadingProgress`. Unit and component tests. | Approval, then a visual review of one article against §8. |
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
│   └── sections/...                   existing; ArticlesSection links to /articles/{slug} (Set B, D-A1)
├── lib/
│   ├── articles.ts                    NEW (Set B): getCachedArticleBySlug, getArticleSlugs, slugify
│   ├── article-mappers.ts             NEW (Set B): ArticleDetail
│   ├── seo.ts                         extended (Set D): buildArticleMetadata, buildBlogPostingJsonLd
│   └── ...                            existing
└── styles/
    ├── main.css                       unchanged
    └── article.css                    NEW (Set C), scoped to .article-page

src/collections/Articles.ts            + slug, + body (Set B)
src/seed/articles.ts                   + bodies for six articles (Set B)
tests/int/                             + SiteChrome parity, + nav link format, + contrast, + mappers, + components
```

---

## 14. Out of scope

- An article index page, comments, newsletter, search, and related articles.
- A sitemap (see §7).
- Changes to `main.css` and the homepage visuals, including the F-A1 button fix (D-A6).
- Draft preview.
- Any change to the existing `vTarikhi` history or the migration docs.
