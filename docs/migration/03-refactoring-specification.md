# 03 — Refactoring specification and implementation sets

This document is the contract for the migration. It defines:

1. the porting rules that preserve the original structure (§1),
2. the target file layout and the file-by-file mapping (§2–§3),
3. the component and data interfaces that decouple the UI from the data source (§4),
4. the decisions that need an explicit answer before the affected set starts (§5),
5. the implementation sets, each with scope, acceptance criteria, and an approval gate (§6).

Read with [01 — Architecture analysis](./01-vtarikhi-architecture-analysis.md) and
[02 — Payload 3 migration roadmap](./02-payload-3-migration-roadmap.md).

## 1. Porting rules (structure preservation)

These rules apply to every set. A deviation is allowed only when it is listed in §5 and approved.

1. **Markup is preserved.** Element tags, `className` strings, `id`s, `data-*` attributes, and element order stay the same.
   Bootstrap and template class names are not renamed or restyled.
2. **Copy is preserved.** Visible text is kept verbatim, including the original spellings and punctuation
   (`"Hiring Me .."`, `"Sponsorship and Work Permit:"`, `"Issued by: "`, `"Leaved"`, `"Click to reveal email"`).
3. **Data never enters components directly.** A component receives typed props. No component imports
   `database.json` or calls Payload.
4. **Server by default.** `'use client'` only at the leaves that need state, effects, or browser APIs (see the
   boundary table in 01 §5). A server component that renders a client leaf passes serializable props only.
5. **Behaviour is preserved.** The interactions in 01 §4 keep their timings and effects (typing speeds, 300px scroll
   thresholds, the 100ms filter delay, the 1500ms back-to-top easing, in-view progress animation).
6. **Function-components-as-calls are converted to components.** `ServiceItem(service)`, `projectCards(item)`,
   and `ArticleCard(article)` become `<ServiceItem … />` and so on. The rendered DOM is identical. Only the `key` moves
   to the call site.
7. **Next.js APIs are replaced by their App Router equivalents.** `next/head` → `metadata` plus a `<script>` in the
   layout. `require('bootstrap')` inside an event handler → `import { Collapse } from 'bootstrap'` at module scope,
   with `Collapse.getOrCreateInstance(el)`. `require(json)` → props.
8. **Debug logging is removed.** None of the 13 active `console.log` calls is ported.
9. **No new dependencies unless listed.** Each set lists its dependency additions explicitly.
10. **Types are strict.** `strict: true` (the root setting) applies. No `any`, and no implicit `any` from `map;` / `filter;` members.

## 2. Target file layout

```text
src/
├── app/(frontend)/
│   ├── layout.tsx                    Set 2: html/body, font, global CSS, metadata, client shell, JSON-LD, Analytics
│   ├── page.tsx                      Set 6: composes the home page from getPortfolioContent()
│   └── styles.css                    Set 2: replaced by the vTarikhi global stylesheet imports
├── components/portfolio/
│   ├── icons.tsx                     Set 3: icon maps (services, footer) — from services.tsx and footer.tsx
│   ├── layout/
│   │   ├── Navigation.tsx            Set 3 [client]   ← navigation.jsx
│   │   ├── Hero.tsx                  Set 5 [server]   ← header.tsx (section markup)
│   │   ├── Footer.tsx                Set 5 [server]   ← footer.tsx (markup)
│   │   ├── BackToTop.tsx             Set 3 [client]   ← libraries.jsx: BackToTopButton
│   │   └── BootstrapClient.tsx       Set 3 [client]   ← libraries.jsx: Libraries (bootstrap bundle)
│   ├── ui/
│   │   ├── TypingEffect.tsx          Set 3 [client]   ← header.tsx: TypingEffect
│   │   ├── EmailReveal.tsx           Set 3 [client]   ← footer.tsx: email reveal
│   │   ├── ProgressBar.tsx           Set 3 [client]   ← skills.tsx: ProgressBar
│   │   └── CoverImage.tsx            Set 3 [client]   ← articles.tsx: image with onError fallback
│   ├── sections/
│   │   ├── AboutSection.tsx          Set 4 [server]   ← about.tsx
│   │   ├── ServicesSection.tsx       Set 4 [server]   ← services.tsx
│   │   ├── SkillsSection.tsx         Set 4 [server]   ← skills.tsx (layout; uses ProgressBar)
│   │   ├── CertificatesSection.tsx   Set 4 [server]   ← certificates.tsx
│   │   ├── ProjectsSection.tsx       Set 4 [server]   ← projects.tsx (shell)
│   │   ├── ProjectsGrid.tsx          Set 3 [client]   ← projects.tsx (filter + grid), props only
│   │   └── ArticlesSection.tsx       Set 4 [server]   ← articles.tsx
│   └── seo/
│       └── JsonLd.tsx                Set 5 [server]   ← head.jsx (script) + schema.json
├── lib/portfolio/
│   ├── types.ts                      Set 1 ✅  view models (no framework imports)
│   ├── format.ts                     Set 1 ✅  date / read-time / join helpers
│   ├── mappers.ts                    Set 1 ✅  pure Payload doc → view model mappers
│   ├── payload-source.ts             Set 1 ✅  Local API queries (the only runtime Payload import)
│   ├── cache.ts                      Set 6    unstable_cache wrapper, tag "portfolio"
│   └── revalidate.ts                 Set 6    revalidateTag helper used by collection/global hooks
├── styles/vtarikhi/                  Set 2    bootstrap.min.css, main.css (copied verbatim)
└── collections/, globals/, seed/     Set 7    schema and seed fixes listed in §6
public/images/                        Set 2    copied from vTarikhi/public/images (4 MB)
tests/int/portfolio-mappers.int.spec.ts  Set 1 ✅  parity tests against the original data
tests/int/portfolio-components.int.spec.ts  Set 3   client island behaviour tests (jsdom)
tests/e2e/frontend.e2e.spec.ts       Set 7    rewritten for the new home page
```

`vTarikhi/` stays in the repository, unchanged, as the reference until the user signs off its retirement (Set 7).
It is excluded from the root `tsconfig.json` and ESLint (done in Set 1).

## 3. File-by-file mapping

| Source (`vTarikhi/`) | Target | Notes |
| --- | --- | --- |
| `pages/index.js` | `app/(frontend)/page.tsx` | Composition only (Set 6). Section order unchanged. |
| `pages/_app.js` | `app/(frontend)/layout.tsx` | CSS imports, font, FontAwesome `config.autoAddCss = false` (Set 2) |
| `pages/_document.js` | `app/(frontend)/layout.tsx` | `<html lang="en">` (Set 2). Root `<main>` wrapper removed because the sections render their own `<main>`. |
| `components/head.jsx` | `layout.tsx` `metadata` + `seo/JsonLd.tsx` | Drop invalid or empty tags (D-7). Use absolute URLs (D-5). |
| `components/schema.json` | `seo/JsonLd.tsx` (constants) | Phone, email, and social URLs are derived from the footer and header data where they exist (D-5). |
| `components/navigation.jsx` | `layout/Navigation.tsx` | Keeps every `Link` and class. `index.html` → `/` (D-8). |
| `components/header.tsx` | `layout/Hero.tsx` + `ui/TypingEffect.tsx` | Props: `HeaderContent`. |
| `components/sections/about.tsx` | `sections/AboutSection.tsx` | Props: `AboutContent \| null`. Keeps `<section id="about">`. |
| `components/sections/services.tsx` | `sections/ServicesSection.tsx` | Props: `ServicesContent`. Hiring CTA from `services.hiring`. |
| `components/sections/skills.tsx` | `sections/SkillsSection.tsx` + `ui/ProgressBar.tsx` | Props: `SkillsContent`, `ExperienceItem[]`, `EducationItem[]`. The single wrapper row is kept, since `experiences` and `educations` were `[[…]]`. |
| `components/sections/certificates.tsx` | `sections/CertificatesSection.tsx` | Props: `CertificateItem[]`. Keeps the LinkedIn "All Certificates" link. |
| `components/sections/projects.tsx` | `sections/ProjectsSection.tsx` + `sections/ProjectsGrid.tsx` | Props: `ProjectsContent`. Keeps `#portfolio-flters` and the motion behaviour. |
| `components/sections/articles.tsx` | `sections/ArticlesSection.tsx` + `ui/CoverImage.tsx` | Props: `ArticleItem[]`. Keeps the LinkedIn "All Articles" link. |
| `components/sections/products.tsx` | none | Empty file. Not ported. |
| `components/footer.tsx` | `layout/Footer.tsx` + `ui/EmailReveal.tsx` | Props: `FooterContent`. `currentYear` removed (unused). |
| `components/libraries.jsx` | `layout/BackToTop.tsx` + `layout/BootstrapClient.tsx` | Bootstrap bundle import moves to module scope in `BootstrapClient`. |
| `components/database.json` | Payload collections and globals + `seed/` | Replaced by `payload-source.ts`. The file stays in `vTarikhi/` as the seed reference. |
| `components/schema.json` | see above | |
| `components/footer.tsx` `awesomeIcon` | `components/portfolio/icons.tsx` | Keys unchanged, so existing CMS values still resolve. |
| `components/sections/services.tsx` `awesomeIcon` | `components/portfolio/icons.tsx` | Same. |
| `styles/main.css`, `styles/bootstrap.min.css` | `styles/vtarikhi/` | Copied verbatim. |
| `bootstrap-icons` (npm) | imported in `layout.tsx` | Same import as `_app.js`. |
| `global.css`, `styles/home.module.css`, `loader.tsx`, `products.tsx` | not ported | Dead code (F-17). |
| `public/images/**` | `public/images/**` (Set 2), then Media (Set 7) | Static paths stay valid during migration. |
| `vTarikhi/next.config.js`, `package.json`, `tsconfig.json`, `package-lock.json` | not ported | Root config and `pnpm-lock.yaml` apply (F-18, F-19). |

## 4. Interfaces (decoupling)

### 4.1 Data boundary

```ts
// Set 1 — implemented
// src/lib/portfolio/payload-source.ts
export const getPortfolioContent: () => Promise<PortfolioContent>

// src/lib/portfolio/types.ts (summary; full definitions in the file)
type PortfolioContent = {
  header: HeaderContent | null
  about: AboutContent | null
  skills: SkillsContent
  experiences: ExperienceItem[]
  educations: EducationItem[]
  certificates: CertificateItem[]
  articles: ArticleItem[]
  services: ServicesContent
  projects: ProjectsContent
  footer: FooterContent | null
}
```

Components receive **slices** of this object. They never receive the whole object, so a section can be tested or
previewed with a fixture.

### 4.2 Component props (contract)

| Component | Props | Client? |
| --- | --- | --- |
| `Hero` | `header: HeaderContent` | server |
| `TypingEffect` | `texts: string[]`, `typeSpeed=100`, `deleteSpeed=20`, `pauseTime=200`, `infinite=true`, `color`, `cursorColor` | client |
| `Navigation` | none | client |
| `AboutSection` | `about: AboutContent` | server |
| `ServicesSection` | `services: ServicesContent` | server |
| `SkillsSection` | `skills: SkillsContent`, `experiences: ExperienceItem[]`, `educations: EducationItem[]` | server |
| `ProgressBar` | `id`, `value`, `label`, `color`, `delay?` (default 0) | client |
| `CertificatesSection` | `certificates: CertificateItem[]` | server |
| `ProjectsSection` | `projects: ProjectsContent` | server (renders `ProjectsGrid`) |
| `ProjectsGrid` | `filters: ProjectFilter[]`, `items: ProjectItem[]` | client |
| `ArticlesSection` | `articles: ArticleItem[]` | server |
| `CoverImage` | `src`, `alt`, `fallbackSrc`, `width`, `height`, `sizes?`, `className?` | client |
| `Footer` | `footer: FooterContent` | server |
| `EmailReveal` | `email: string`, `className?` | client |
| `BackToTop` | none | client |
| `BootstrapClient` | none (imports bootstrap JS once) | client |
| `JsonLd` | `data: Record<string, unknown>` | server |

Each section component returns `null` when its data is missing, which matches the original behaviour of rendering
nothing for an empty array.

### 4.3 Cache and invalidation contract (Set 6)

```ts
// src/lib/portfolio/cache.ts
export const getCachedPortfolioContent: () => Promise<PortfolioContent>  // unstable_cache, tags: ['portfolio']

// src/lib/portfolio/revalidate.ts
export const revalidatePortfolio: () => void   // revalidateTag('portfolio', 'max'), errors logged, never thrown
```

Every content collection and the `footer` global call `revalidatePortfolio` from `afterChange` and `afterDelete`.

## 5. Decisions

Each decision has a **default** that Sets 1–6 implement unless you say otherwise. Decisions marked **before Set X**
must be answered before that set starts.

| ID | Question | Default (used unless changed) | Alternatives | Needed before |
| --- | --- | --- | --- | --- |
| **D-1** | Where does the site live? | Co-located in the root Payload app, route group `(frontend)`, using the Local API | Separate Next app that reads Payload over REST or GraphQL | Set 2 |
| **D-2** | Are `header` and `about` singletons? | Keep as collections with `limit: 1` (no schema change in Set 1) | Convert to globals (cleaner; needs a migration and seed change) | Set 6 |
| **D-3** | Where does the hiring CTA live? | `footer.hiringCta`, rendered in the Services section | Move to a `services` global or to `header` | Set 4 |
| **D-4** | Where do project filters come from? | Constant in `mappers.ts`, asserted by a test against `Projects.categories` | Derive from the field options at runtime | Set 4 |
| **D-5** | Canonical site URL and domain | `NEXT_PUBLIC_SITE_URL` with a fallback to `https://www.etarikhi.com`, as in `head.jsx` | `https://vtarikhi.com`, as in the README. **Answered: `https://vtarikhi.com` (Set 5 fallback).** | Set 5 (answered) |
| **D-6** | Copyright year | Use the CMS value (`2023`), so the rendered text is unchanged | Render the current year (the original code computed it but did not use it) | Set 5 |
| **D-7** | SEO tags | Drop the invalid `X-Content-Type-Options` meta and the empty `fb:*` / `ia:*` tags. Make `og:image` an absolute URL to an existing file (`/images/profile.webp`). | Keep all tags as they are | Set 5 |
| **D-8** | Brand links | `/` instead of `index.html` | Keep `index.html` (it does not resolve in Next) | Set 3 |
| **D-9** | Project "eye" button | Direct link to the full image, as today. Fix the `aria-label`. No lightbox. | Add a lightbox library (new dependency) | Set 4 |
| **D-10** | Image source during migration | Keep `public/images/**` in Set 2. Move to Media uploads in Set 7. The mappers already prefer uploads. | Upload to Media first | Set 2 |
| **D-11** | Placeholder homepage and auth greeting | Remove the template page and its `payload.auth()` call. Keep the `Analytics` and `SpeedInsights` components. | Keep the template page under another route | Set 6 |
| **D-12** | Article filters | Show all articles, as the original site does. `category` and `featured` are not rendered. | Filter by `featured` | Set 4 |
| **D-13** | `ProjectsGrid` owns the title row | `ProjectsGrid` renders the "My Projects" heading and the filter list, because they share one row with the filter state. `ProjectsSection` (Set 4) renders only the section and container wrappers. | Keep the heading in the server shell and pass the filter as a slot | Set 3 (approved) |
| **D-14** | Bootstrap JS types | A minimal ambient declaration in `src/types/bootstrap.d.ts` for `Collapse` only. No `@types/bootstrap` dependency. | Add `@types/bootstrap` (new dependency, not listed in §6) | Set 3 (applied) |
| **D-15** | How Bootstrap JS loads | `Navigation` imports `Collapse` inside its click handler, and `BootstrapClient` imports the bundle inside `useEffect`. Both are the original patterns (`require` in the handler, dynamic `import()` in `useEffect`). The module-scope imports in spec §1 rule 7 are not used. | Keep the module-scope imports. This fails at prerender: Bootstrap's `Alert` setup calls `document` when the module loads, so `next build` stops with `document is not defined`. | Set 6 (applied; **approved**, a deviation from §1 rule 7) |

## 6. Implementation sets

Each set ends with an **approval gate**. The next set does not start until you explicitly approve it.

### Set 1 — Data foundation ✅ (delivered in this turn; awaiting approval)

**Scope.** View models, pure mappers, the Payload Local API data source, the parity test suite, and the two
config changes needed for the root project to typecheck.

**Files.**

| File | Status |
| --- | --- |
| `src/lib/portfolio/types.ts` | created |
| `src/lib/portfolio/format.ts` | created |
| `src/lib/portfolio/mappers.ts` | created |
| `src/lib/portfolio/payload-source.ts` | created |
| `tests/int/portfolio-mappers.int.spec.ts` | created |
| `tsconfig.json` | `vTarikhi` added to `exclude` |
| `eslint.config.mjs` | `vTarikhi/` added to `ignores` |
| `docs/migration/01…03` | created |

**Acceptance criteria.**

- [x] Root `tsc --noEmit -p tsconfig.json` passes with `strict: true` (before: 49 errors, all in `vTarikhi/`).
- [x] 24 parity tests pass. Expected strings come from `vTarikhi/components/database.json`.
- [x] The date tests pass under `TZ=America/Los_Angeles` and `TZ=Pacific/Kiritimati`.
- [x] Mutation check: a wrong education separator is caught (2 tests fail). A local-timezone date bug is caught (1 test fails).
- [x] Prettier passes on the new files.
- [x] No changes under `vTarikhi/`. No runtime change to the site, because no route imports the new code yet.
- [ ] Runtime check of `payload-source.ts` against Postgres. **Deferred to Set 6** because the sandbox has no database.

**Known gaps in Set 1 (not blockers).**

- `pnpm lint` cannot run: `eslint.config.mjs` imports `@eslint/eslintrc`, which is not a declared dependency (F-23).
- `tests/int/api.int.spec.ts` needs a database and is not run here.

**Gate.** Approve Set 1, and answer D-1 to D-5 (see §5). D-2 and D-3 can wait for Set 4 and Set 6.

### Set 2 — Global shell and assets ✅ (approved)

**Scope.** The CSS, font, and assets that every page needs. The home page is still the template until Set 6.

**Dependencies to add (root `package.json`).** `bootstrap` (JS bundle, `^5.3.3`), `bootstrap-icons` (`^1.11.3`),
`@fortawesome/fontawesome-svg-core`, `@fortawesome/free-brands-svg-icons`, `@fortawesome/free-solid-svg-icons`,
`@fortawesome/react-fontawesome` (versions as in `vTarikhi/package.json`), and `framer-motion` (`^12.0.6`).
The root lockfile is updated with `pnpm install`.

**Files.**

- `src/styles/vtarikhi/bootstrap.min.css`, `main.css` (copied verbatim).
- `public/images/**` (copied from `vTarikhi/public/images`).
- `src/app/(frontend)/layout.tsx`: `<html lang="en">`, `Open_Sans` via `next/font/google` (same weights and subsets),
  global CSS imports in the same order as `_app.js`, FontAwesome `config.autoAddCss = false`,
  `metadata` (title and description from `head.jsx`), and the existing `Analytics` and `SpeedInsights`. No `<main>` wrapper.
- `src/app/(frontend)/styles.css`: replaced by the vTarikhi stylesheet imports.
- `next.config.ts`: `images.localPatterns` gains `{ pathname: '/images/**' }`, so `next/image` keeps working for
  static images (F-02, R-1).

**Acceptance criteria.**

- `pnpm build` succeeds for the root project in an environment with network access to Google Fonts.
- `/images/profile.webp` returns 200 through `/_next/image?url=%2Fimages%2Fprofile.webp&w=640&q=75`.
- The `(payload)` admin still loads at `/admin`.
- Root `tsc` passes.

**Gate.** Approve Set 2 (and D-1, D-10 if not already approved).

### Set 3 — Client islands ✅ (delivered; awaiting approval)

**Scope.** Every component that needs state or browser APIs. Each one is ported with its original markup and timings.

**Files.** `layout/Navigation.tsx`, `layout/BackToTop.tsx`, `layout/BootstrapClient.tsx`, `ui/TypingEffect.tsx`,
`ui/ProgressBar.tsx`, `ui/EmailReveal.tsx`, `ui/CoverImage.tsx`, `sections/ProjectsGrid.tsx`, `icons.tsx`.

**Behaviour notes.**

- `Navigation`: the scroll state keeps the 300px threshold. The mobile collapse uses
  `Collapse.getOrCreateInstance(navbarCollapse).hide()` (replaces `require` inside a handler).
- `ProjectsGrid`: the 100ms filter delay and the `layout` animation are kept. The `isLoading` value is removed because it is never rendered.
- `CoverImage`: `onError` falls back to a real placeholder file (F-08). Add the placeholder to `public/` in this set.

**Tests.** `tests/int/portfolio-components.int.spec.ts` (jsdom, `@testing-library/react`, already in devDependencies):
typing advances through the texts, the email reveal swaps to a `mailto:` link, the filter shows only matching projects,
and the back-to-top button appears after scrolling past 300px.

**Acceptance criteria.** Tests pass. Each client component renders the same DOM as the original for the same props.

**Gate.** Approve Set 3.

### Set 4 — Server sections ✅ (approved)

**Scope.** The content sections, rendered on the server with props.

**Files.** `sections/AboutSection.tsx`, `sections/ServicesSection.tsx`, `sections/SkillsSection.tsx`,
`sections/CertificatesSection.tsx`, `sections/ProjectsSection.tsx`, `sections/ArticlesSection.tsx`.

**Decisions applied.** D-3 (hiring CTA from footer), D-4 (filters from code), D-9 (eye button label), D-12 (all articles), D-13 (title row in `ProjectsGrid`).

**Notes.**

- D-9 wording: the eye button reads `View full image of <title>`. The original `Read more about` was wrong for a direct image link.
- F-08 (about): the gallery fallback `/images/placeholder.svg` is removed. The mapper already drops empty image URLs, so the fallback could never run.
- Empty lists: the spec says sections return `null` for missing data, and says this matches the original for empty arrays. The original does not do that. It still renders the heading and an empty grid. Set 4 keeps the original behaviour. Only a missing singleton returns `null`.
- Test helpers: the fixtures moved to `tests/helpers/portfolio-fixtures.ts` (shared by the mapper and section suites). `tests/helpers/visible-intersection-observer.ts` is the IntersectionObserver double.


**Acceptance criteria.**

- Each section renders text identical to the baseline text extract (`/tmp/parity/vtarikhi-home.text.txt`) for its region.
- `<section id>` values are `about`, `service`, `skill`, `certificate`, `project`, `article`.
- The services icons, which depend on `iconFont` keys, render for every seeded value.

**Gate.** Approve Set 4.

### Set 5 — Hero, footer, and SEO ✅ (approved)

**Scope.** The hero, the footer, and the JSON-LD script.

**Files.** `layout/Hero.tsx`, `layout/Footer.tsx`, `seo/JsonLd.tsx`, plus `src/lib/portfolio/seo.ts` (metadata and JSON-LD builder) and the metadata in `(frontend)/layout.tsx`.

**Decisions applied.** D-5 (site URL), D-6 (copyright year from the CMS), D-7 (SEO tag cleanup).

**Set 5 choices to confirm:**

- `og:site` is dropped. It is not a valid Open Graph property. The valid `og:site_name` is kept.
- The copyright link `url: "#"` is kept as it is in the CMS data.
- The JSON-LD `<script>` and the Hero/Footer wiring into the layout move to Set 6, because they need content data.
- `NEXT_PUBLIC_SITE_URL` falls back to `https://vtarikhi.com`. The user confirmed this domain for D-5.

**Acceptance criteria.**

- [x] The hero text, the request-CV link, and the footer lists match the baseline text (`tests/int/portfolio-shell.int.spec.ts`).
- [x] The JSON-LD parses as valid JSON and contains the `Person` type, the name `Amir v.Tarikhi`, and the `sameAs` list. `<` is escaped as `\u003c`.
- [x] No empty `<meta content="">` tags remain. Verified on the rendered home page. The only empty one is `next-size-adjust`, which Next adds itself.
- [x] `og:image` is absolute, 668×689 `image/webp` (measured; the original `400` was wrong).

**Verification.** `tsc --noEmit` exit 0. Shell tests 17/17. One test was added after a mutation check showed that substring matching let a `Contacts` label pass. `next build` succeeds.

**Approved.** The user approved Set 5 and confirmed D-5 (`https://vtarikhi.com`).

### Set 6 — Integration, caching, and revalidation ✅ (approved)

**Scope.** Compose the home page from the data layer, add caching and on-demand revalidation, and remove the template.

**Files.**

- `src/app/(frontend)/page.tsx`: the composition, in the original order. Calls `getCachedPortfolioContent()`. It does not call `headers()`, `cookies()`, or `payload.auth()`.
- `src/lib/portfolio/cache.ts`: `getCachedPortfolioContent`, which uses `unstable_cache` with key `['portfolio-content']` and tag `portfolio`.
- `src/lib/portfolio/revalidate.ts`: `revalidatePortfolio`, which calls `revalidateTag('portfolio', 'max')`. Errors are logged and never thrown.
- `src/lib/portfolio/hooks.ts`: `portfolioAfterChange` and `portfolioAfterDelete`.
- The hooks are attached to the 10 content collections (`header`, `about`, `skills`, `experiences`, `educations`, `certificates`, `articles`, `services`, `projects`, `media`) and the `footer` global (`afterChange` only, since globals have no delete).
- The Set 1 runtime check of `payload-source.ts` against Postgres is done (see Verification).

**Decisions applied.** D-2 (singletons stay collections with `limit: 1`), D-11 (template page and `payload.auth()` removed), D-15 (Bootstrap loading, approved). `Analytics` and `SpeedInsights` stay in the layout, and `styles.css` is no longer imported by the page.

**Acceptance criteria.**

- [x] `next build` lists `/` as static (`○`), not dynamic (`ƒ`) (R-4). Verified against a local Postgres 18.4.
- [x] Saving a document changes the home page after revalidation (R-5). Verified with `PATCH /api/header/1` on the running production server. The next request still returned the old value, because `revalidateTag(..., 'max')` serves stale content while it regenerates. The request three seconds later returned the new value, and the JSON-LD `name` changed with it. The test used the REST API. I did not drive the `/admin` browser UI. The same hooks are attached to the collections that the UI edits.
- [x] A hook failure does not fail the save. The seed script runs outside a Next request, so every `revalidateTag` call threw. All seed writes still succeeded. A unit test also checks that a throwing cache call does not throw from the hook.
- [x] `/admin` returns 200, `/api/header` returns 200, and `POST /api/graphql` returns 200. The `(payload)` route group is unchanged.

**Verification.**

- `tsc --noEmit` exit 0.
- Vitest: 77 passed, 1 skipped. The one skipped test is `api.int.spec.ts`, which needs `PAYLOAD_SECRET` and `POSTGRES_URL` to run. With them set, it passes against Postgres.
- `tests/int/portfolio-cache.int.spec.ts`: 10 tests. Hook attachment on all 11 targets, the revalidation contract, the cache tag, and the page order. Two mutation checks were run: swapping two sections and removing the `Media` hook. Both made the tests fail.
- Rendered HTML of `/`: all 6 sections, the hero, the footer, and one `Person` JSON-LD block (6 `sameAs` links). `og:image` is absolute. No empty `content` meta tags, except Next's own `next-size-adjust`.

**Known gaps and notes for Set 7.**

- The build needs the database. `/` is prerendered from Postgres, so a build without a reachable `POSTGRES_URL` cannot produce the static page. This follows from R-4 and is not separately tested.
- Seed data drifts from `vTarikhi/components/database.json` in four places. The parity tests use `database.json`, so they do not catch these. The seed is not changed in Set 6:
  1. Four experience `company` values lose the location. `database.json` has `"Tiryaki İlaç LTD. ŞTİ. Istanbul, Turkey"`, and the seed has only `Tiryaki İlaç LTD. ŞTİ.`. The same applies to Proxima, Cadde10, and ARK.
  2. The service text `Ajax, JavaScript, TypeScript` lacks the trailing comma.
  3. The article excerpt "Günümüz yazılım geliştirme dünyasında …" contains replacement characters in the seed (F-15).
  4. Media uploads fail in the seed. It fetches relative URLs, which Node's `fetch` cannot resolve, and no Blob token is set. Certificate, article, and project images are missing locally.
- Revalidation runs in the save request, so a slow cache call adds time to the save. The `revalidatePortfolio` path is a single tag call.

**Approved.** The user approved Set 6 and D-15 (keep the client-side loading).

### Set 7 — Content, QA, and cleanup ✅ (signed off; `vTarikhi/` is kept)

**Scope.** Fix the data-model and seed issues found in the analysis, update tests and docs, and prepare the retirement decision for `vTarikhi/`.

**Changes.**

- **F-10:** `Projects.image` description corrected to match the mapper. `media.sizes` does not exist, so no size was added.
- **F-12:** `Experiences` has `defaultSort: 'order'`.
- **F-13 (user answered "convert"):** `Services.iconFont`, `Footer` social `iconName`, and `Footer` contact `iconName` are `select` fields. The options come from the icon maps in `icons.tsx`. The footer `className` description is corrected to "Bootstrap text color class", since the value is a text color.
- **F-15, F-22, and the seed drift** (found while checking parity): the corrupted article excerpt now matches `database.json`. The services line has its trailing comma. The four experience `company` values have their locations back.
- **F-23 (user answered "add `@eslint/eslintrc`"):** `eslint.config.mjs` imports `eslint-config-next/core-web-vitals` and `/typescript` directly, because `eslint-config-next` exports flat config arrays. The `FlatCompat` layer is gone. The rules are unchanged. `@eslint/eslintrc` is declared in `devDependencies`, as the user chose, but **the config does not import it**. It can be removed with `pnpm remove @eslint/eslintrc` with no effect on lint.
- **Unused imports** in `tests/int/portfolio-mappers.int.spec.ts` (Set 1) are removed.
- **F-16:** no `console.log` remains in the app or the tests. The seed script's own progress output is CLI output and is kept.
- **F-21:** `PAYLOAD.md` describes the site, the content model, the caching behaviour, and the checks. `README.md` gets a site description, the correct GraphQL path (`/api/graphql`), and no generic use-case text. The README's Prettier failure was already in `HEAD` and is unchanged.
- **Generated types:** `src/payload-types.ts` is regenerated for the select fields. The Blob plugin's `_objectKey` lines are restored by hand, because they disappear when the sandbox has no Blob token.
- **Test fixtures** are typed for the new unions (`tests/helpers/portfolio-fixtures.ts`).

**Decisions applied.**

- **Media uploads skipped (user answered "skip the upload step").** `public/images` is not uploaded, and the legacy URL fields (`imageUrl`, `src`, `placeHolder`, `images[].imageUrl`) stay. The mappers prefer uploads and fall back to these fields, so the images still render. The Set 7 step to remove the legacy fields is **not done**.
- **E2E (user answered "Vitest instead").** `tests/e2e/frontend.e2e.spec.ts` is unchanged. It still expects template text and fails as it did before. The home-page checks are in `tests/int/portfolio-cache.int.spec.ts`.

**Acceptance criteria.**

- [x] `tsc --noEmit` exits 0.
- [x] `pnpm lint` exits 0 (0 errors). There are 7 warnings, all in template files (`payload.config.ts`, `src/app/my-route/route.ts`, `src/seed/index.ts`, and the two e2e specs).
- [x] `next build --webpack` passes, with the Google Fonts response mocked locally. `/` is `○` (static).
- [ ] `pnpm build` (Turbopack, the default) **fails in this sandbox**, because it cannot fetch Open Sans from Google Fonts (R-8). It needs network access to `fonts.googleapis.com`.
- [x] Vitest: 78 passed. `api.int.spec.ts` needs `PAYLOAD_SECRET` and `POSTGRES_URL` set. Without them it fails with a missing-secret error, so run the suite with both set.
- [ ] Playwright e2e: **not run**. The browser download is blocked in this sandbox, and the spec is unchanged (see above).
- [x] Parity diff against the baseline, rendered from a local Postgres seeded with the Set 7 data. See below.
- [x] `vTarikhi/` is unchanged (`git status` shows no changes under it).

**Parity diff (visible text, word level).** The baseline is `/tmp/parity/vtarikhi-home.text.txt`. Words are compared in order. Every difference is an insertion. No word is missing or changed.

- `<title>`: the text is the same as the original title. It is in `<head>`, so the body baseline does not include it.
- `|` (hero typing cursor), `+` (in "12+ Years"), `•` (article date separator), and `0 %` (progress bar start value): the original server-rendered HTML contains each of these. The baseline text file was captured without them.
- Expected approved changes, not visible in this text: D-5 (absolute URLs in JSON-LD and `og:`), D-7 (the removed meta tags), and D-8 (brand link `/`).

**Known gaps for sign-off.**

- A seed or direct database change does not refresh the cached home page until the next build or deploy, or until a document is saved in the admin. Documented in `PAYLOAD.md`. This was seen in practice: the first build after reseeding served the old content from `.next/cache/fetch-cache`.
- Seed uploads still fail in the seed script, because it fetches relative URLs and there is no Blob token. The seed still warns for each image. The legacy fields keep the images working.

**Signed off.** The user signed off Set 7 and chose to keep `vTarikhi/` as the reference copy. Retiring it is a separate decision for later.

## 7. Out of scope

- Visual redesign, new sections, or new content types.
- Multi-language support (the README claims it, but the site has no i18n).
- A contact form (the README mentions one, but the site has none).
- Analytics changes beyond keeping the existing Vercel components.
- Draft preview and live preview for the home page (possible later, see 02 §3).
- Performance work such as removing the double image download (F-07) beyond what the new image pipeline gives for free.
