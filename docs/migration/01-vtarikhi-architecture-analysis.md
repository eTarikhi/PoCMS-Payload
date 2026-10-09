# 01 — vTarikhi architecture analysis

Scope: the `vTarikhi/` folder at the repository root (a standalone Next.js resume site).
This document describes the **current** state only. The target design is in
[02 — Payload 3 migration roadmap](./02-payload-3-migration-roadmap.md) and the
file-level plan is in [03 — Refactoring specification](./03-refactoring-specification.md).

## 0. Method and baseline

- Read every source file in `vTarikhi/` (components, pages, styles, data, config).
- Installed `vTarikhi` in a scratch copy (`/tmp/vtarikhi-baseline`, not the repo) and ran `next build`.
  - `npm ci` fails: `vTarikhi/package-lock.json` is out of sync with `package.json`
    (missing `@img/sharp-win32-*`, `semver`, `detect-libc` entries). `npm install` was used for the baseline.
  - The build needs `fonts.googleapis.com` (for `next/font/google`). The sandbox cannot reach it, so the
    scratch copy stubs `Open_Sans` with a system font. This does not change any markup or CSS.
  - Result: `/` is statically prerendered. Route JS is 84 kB, first load JS 199 kB.
- Captured the rendered HTML of `/` as a parity reference: `/tmp/parity/vtarikhi-home.html`
  and a text extraction, `/tmp/parity/vtarikhi-home.text.txt`. These are outside the repo.

## 1. Stack

| Concern | Current implementation |
| --- | --- |
| Framework | Next.js 15.5 (`next` `^15.5.21`), **Pages Router** (`pages/`) |
| UI | React 19, JSX/TSX mixed (`.js`, `.jsx`, `.tsx`) |
| Styling | Vendored Bootstrap 5 CSS (`styles/bootstrap.min.css`), `styles/main.css` (template theme), `bootstrap-icons` CSS package, `global.css` (not imported) |
| Bootstrap JS | Loaded at runtime with `import("bootstrap/dist/js/bootstrap.bundle.js")` in `libraries.jsx` |
| Icons | `@fortawesome/react-fontawesome` + free-solid/brands (`config.autoAddCss = false`) |
| Animation | `framer-motion` 12 (`motion`, `AnimatePresence`, `useInView`). `wow.js` classes are present but WOW.js is not loaded |
| Font | `Open_Sans` via `next/font/google` in `_app.js` |
| Data | `components/database.json` (static JSON, bundled into the app) |
| Build output | Fully static; no `getStaticProps`, `getServerSideProps`, API routes, or dynamic segments |

## 2. Routing

- **One route**: `/` (`pages/index.js`). There is no custom 404 page, so Next's default is used.
- `pages/_app.js` applies global CSS, the font, and FontAwesome config. `pages/_document.js` sets `<html lang="en">`.
- Navigation is **in-page hash anchors** only:

| Nav label (`navigation.jsx`) | Target | Section component |
| --- | --- | --- |
| Home | `#home` | `Header` (`<div id="home">`) |
| About | `#about` | `AboutSection` |
| Skills | `#skill` | `SkillSection` |
| Services | `#service` | `ServiceSection` |
| Projects | `#project` | `ProjectSection` |
| Contact | `#contact` | `Footer` `<nav id="contact">` |

- `#certificate` and `#article` exist as sections but have no navigation entry.
- Brand links use `href="index.html"`. This is a legacy static-HTML link and does not resolve in Next.js.
- Scroll-spy: `<main data-bs-spy="scroll" data-bs-target=".navbar" data-bs-offset="51">` depends on the Bootstrap JS bundle.
- Mobile menu: the toggler calls `new (require('bootstrap')).Collapse(#navbarCollapse).hide()` on every link click.

## 3. Component hierarchy

```
pages/_app.js                        global CSS, font, FontAwesome config
└─ pages/index.js  Home              route "/", static
   ├─ HeadBlock        components/head.jsx          next/head: JSON-LD, <title>, meta, icons, og:*
   ├─ Menu             components/navigation.jsx     [client] scroll state, Collapse on link click
   ├─ Header           components/header.tsx         hero: sureName, professionTexts, requestCV, profile image
   │   └─ TypingEffect (internal)                    [client] typewriter loop
   ├─ <main data-bs-spy="scroll">
   │   ├─ AboutSection     sections/about.tsx        #about: years, work permit, 2 images, interests
   │   ├─ ServiceSection   sections/services.tsx     #service: hiring CTA + service cards
   │   │   └─ ServiceItem (function, not a component)
   │   ├─ SkillSection     sections/skills.tsx       #skill: progress bars + experience/education tabs
   │   │   ├─ ProgressBar  [client]  in-view animation
   │   │   ├─ Experiences  (function component)
   │   │   └─ Educations   (function component)
   │   ├─ CertificateSection sections/certificates.tsx  #certificate
   │   ├─ ProjectSection   sections/projects.tsx     #project: filter bar + grid  [client]
   │   │   └─ projectCards(item) (function, returns motion.div)
   │   └─ ArticleSection   sections/articles.tsx     #article
   │       └─ ArticleCard (function) with onError image fallback
   ├─ Footer           components/footer.tsx         [client] email reveal; #contact
   └─ Libraries        components/libraries.jsx      [client] bootstrap bundle import + BackToTopButton
```

**Files not used by the running app**

| File | Status |
| --- | --- |
| `components/sections/products.tsx` | 0 bytes; not imported |
| `global.css` | Only referenced in a comment in `_app.js` |
| `styles/home.module.css` | Not imported |
| `loader.tsx` | Only referenced from a commented-out `images.loader` block in `next.config.js` |
| `components/schema.json` | Used, but only through `head.jsx` |
| `public/images/bg-icon.webp` | Referenced only by `.service` CSS rule in `main.css`, not by markup |

## 4. Data flow

```
components/database.json   (one-element array, 10 top-level keys)
        │  require("./../database.json")  — evaluated at module load, in each file
        ▼
module-level constants     jsonDB.map(d => d.<section>)[0]   (or nested [[...]] for experiences/educations)
        │  no props, no context, no fetch
        ▼
section components          render straight from module constants
        │
        ▼
client state only           TypingEffect, Menu scroll, ProjectSection filter, Footer email reveal,
                            ProgressBar animation, BackToTop visibility
```

Key characteristics:

1. **No data boundary.** Every component imports the JSON directly. Changing the data source means editing about nine files.
2. **Wrapper-array pattern.** Each section does `jsonDB.map(d => d.x)` and then uses `[0]`, so the "one page" wrapper is repeated per component. `experiences` and `educations` end up as `[[...]]` and are rendered as a single row.
3. **Debug logging on import.** There are 13 active `console.log` calls, all at module scope (for example `Imported JSON data:`, `Projects:`, `Skills:`). A 14th is commented out in `head.jsx`. They run on the server during build and in the browser at runtime.
4. **Whole dataset in the client bundle.** Because the page is hydrated, the JSON used by all sections ships in the JS bundle.
5. **Schema duplicated.** Contact data is repeated in `schema.json` (`telephone`, `sameAs`), in `database.json` (`header.requestCV`, `footer.socialLinks`, `footer.contactInfo`), and in the `Footer` seed. Phone and WhatsApp numbers are not single-sourced.

### Client-side state inventory

| Component | State / effect | Behaviour to preserve |
| --- | --- | --- |
| `Menu` | `isVisible` set on `scroll` > 300px | Navbar gets `d-flex` after scrolling past 300px |
| `Menu` | Click handler on toggler and links | Collapses `#navbarCollapse` on mobile |
| `TypingEffect` | `displayText`, `currentTextIndex`, `isDeleting`, `iterationCount` | Types/deletes `professionTexts` forever (`typeSpeed=100`, `deleteSpeed=20`, `pauseTime=200`) |
| `ProgressBar` | `useInView(once, amount 0.3)`, `progress` | Animates width to `value` on first view; `delay` is never set in data, so it effectively runs at 0 |
| `ProjectSection` | `activeFilter`, `filteredItems`, `isLoading` (unused in render) | Category filter with a 100ms delayed filter; `isLoading` spinner is commented out |
| `projectCards` `handleImageOverride` | `onLoad` swaps `src` from thumbnail to full image | Performance trick; see finding F-07 |
| `ArticleCard` image | `onError` replaces `src` with `/placeholder.svg` | File does not exist (F-08) |
| `Footer` | `emailRevealed` | Click on "Click to reveal email" replaces text with a `mailto:` link |
| `BackToTopButton` | `showButton` on scroll > 300px; `requestAnimationFrame` easing scroll | Smooth scroll to top over 1500ms |
| `Libraries` | `import("bootstrap/dist/js/bootstrap.bundle.js")` on mount | Enables scroll-spy, Collapse, and tab pills |

## 5. Server / client boundary analysis (for the migration)

| File | Hooks / browser APIs | Migration boundary |
| --- | --- | --- |
| `about.tsx` | none | Server Component |
| `services.tsx` | none (Link and icons only) | Server Component |
| `certificates.tsx` | none | Server Component |
| `articles.tsx` | `onError` on `<Image>` | Server shell + small client `<CoverImage>` for the fallback |
| `skills.tsx` | `useInView`, `useState`, `useEffect` in `ProgressBar` | Server section + client `ProgressBar` |
| `projects.tsx` | `useState`, `useEffect`, `setTimeout`, `motion`, `onLoad` | Client island for the filter grid; data passed as props |
| `header.tsx` | `useState`, `useEffect` in `TypingEffect` | Server hero + client `TypingEffect` |
| `navigation.jsx` | `useState`, `useEffect`, `window`, `document` | Client island |
| `footer.tsx` | `useState` | Server footer + client `EmailReveal` |
| `libraries.jsx` | `useEffect`, `window`, framer-motion | Client island |
| `head.jsx` | `next/head` | Replace with the App Router `metadata` API plus a JSON-LD `<script>` |
| `_app.js`, `_document.js` | global CSS, font | Replace with `app/(frontend)/layout.tsx` |

## 6. Data contract: vTarikhi JSON vs. existing Payload collections

The repository already contains Payload collections that model most of this data
(`src/collections/*`, `src/globals/Footer.ts`). The gaps below must be resolved by the
data-layer mappers (Set 1) or by schema changes that are approved separately.

| vTarikhi key | Rendered as | Payload source | Gap / action |
| --- | --- | --- | --- |
| `header.sureName`, `professionTexts`, `requestCV` | Hero | `header` collection | Matches. `header` is a collection, not a singleton global. |
| `header.imageUrl` | Hero `<Image>` | `header.profileImage` (upload) or `header.imageUrl` | Both exist. Mapper prefers the upload URL and falls back to the text URL. |
| `about.experience`, `workPermit`, `interests` | About | `about` collection | Matches. `about.title` is required in Payload but never rendered. |
| `about.images[]` (string paths) | About gallery | `about.uploadImages` (upload, hasMany) and `about.images[].imageUrl` | Mapper prefers uploads and falls back to the URL array. |
| `skills.frontend[]`, `skills.backend[]` | Progress bars | `skills` collection with `group` and `order` | Matches. Mapper groups by `group` and sorts by `order`. |
| `experiences[]` | Experience tab | `experiences` collection | Matches. Collection has `order` but **no `defaultSort`** (F-12). |
| `educations[]`: `title`, `date`, `location` | Education tab; `location` is shown in the `<h6>` | `educations`: `title`, `institution` (required), `location`, `date` | **Gap.** vTarikhi shows `"<institution> / <location>"`. Mapper joins the two fields to keep the same text. |
| `certificates[]`: `date` as a display string | Certificate card | `certificates.issuedAt` (date) | Mapper formats the date in UTC as `MMMM d, yyyy`. |
| `articles[]`: `author` (a date string), `readTime` (`"3 min"`) | Article footer: `Issued: {author} • {readTime} read` | `articles.publishedAt` (date), `articles.readTime` (number) | **Gap.** Mapper derives `author` from `publishedAt` and `readTime` as `"<n> min"`. `defaultSort` is ascending (F-11), so queries must sort `-publishedAt`. |
| `services.items[]` | Service cards | `services` collection | Matches. `iconFont` is free text, so an unknown icon name renders nothing (F-13). |
| `services.hiring[]` (title, link) | CTA button in the Services header | `footer.hiringCta` (group: label, url) | **Ownership mismatch.** The data lives in the Footer global but is rendered in the Services section. Mapper keeps this for now (decision D-3). |
| `projects.categories[]` | Filter bar (`All`, `Front-End`, `Back-End`, `CMS-CRM`) | Select options on `projects.categories` | `All` is a UI-only entry. Labels match the Payload select options. Filter list stays in code (D-4). |
| `projects.items[]`: `placeHolder`, `src`, `alt`, `url`, `class[]` | Project card | `projects`: `image` (upload), `placeHolder`, `src`, `title`, `url`, `categories` | Matches. `alt` maps to `title`. The thumbnail size referenced in the field description is not configured (F-10). |
| `footer.socialLinks[]` | Footer social icons | `footer.socialLinks[]` (`platform`, `url`, `iconName`, `ariaLabel`) | Matches. `platform` is new and not used by the UI. `iconName` is free text (F-13). |
| `footer.personalInfo` | Footer name and bullet list | `footer.roles` (`fullName`, `footerRoles`) | Naming only. |
| `footer.profiles[]`, `contactInfo[]` | Footer lists | `footer.profiles[]`, `footer.contactInfo[]` | Matches, including `type` enum and `className`. |
| `footer.copyright` (`year`, `website`, `url`) | Copyright line | `footer.copyRight` (`year`, `website`, `url`) | Naming only. The collection description says the year is "generated by the frontend", but the UI hard-codes `2023` (D-6). |
| `components/schema.json` | JSON-LD `Person` | none | Not in CMS. Move to a site-settings global or generate from the header and footer data (D-5). |
| `head.jsx` meta and title | `<title>`, description, OG | none | Move to a site-settings global or constants with the Next `metadata` API (D-5, D-7). |

## 7. Findings

Severity: **H** = blocks or misleads the migration; **M** = behavioural or SEO defect; **L** = cleanup.

| ID | Sev | Finding | Evidence | Plan |
| --- | --- | --- | --- | --- |
| F-01 | H | **Root typecheck already fails because of `vTarikhi/`.** Root `tsconfig.json` includes `**/*.ts(x)`, which picks up the vTarikhi components. The root project does not install `framer-motion`, FontAwesome, or Bootstrap, so `tsc --noEmit` reports 49 errors, all under `vTarikhi/components/`. | `tsc -p tsconfig.json` on the repo as checked out | Exclude `vTarikhi` from the root tsconfig and ESLint (Set 1). |
| F-02 | H | **Root `next.config.ts` would block the migrated images.** `images.localPatterns` only allows `/api/media/file/**`. Next 16.3.3 rejects any other local `next/image` URL with `"url" parameter is not allowed` once `localPatterns` is set. | `node_modules/next/dist/server/image-optimizer.js` and `shared/lib/match-local-pattern.js` | Add `/images/**` and any other static patterns when assets move (Set 2). |
| F-03 | H | **Singleton data is modelled as a collection.** `header` and `about` each contain exactly one document but are collections, so the frontend must use `limit: 1`. | `src/collections/Header.ts`, `About.ts` | Keep as collections for Set 1 (no schema change). Decision D-2 covers converting them to globals. |
| F-04 | M | **Brand links point to `index.html`.** | `navigation.jsx` (two `Link href="index.html"`) | Change to `/` (D-8). |
| F-05 | M | **Invalid or no-op SEO tags.** `X-Content-Type-Options` is a `<meta>` with a MIME value. It is not a valid HTTP header or meta name. `fb:page_id`, `fb:pages`, and `ia:*` are empty. | `head.jsx` | Drop the invalid and empty tags (D-7). |
| F-06 | M | **Stale and inconsistent site URLs.** `og:image` is `//www.etarikhi.com/assets/img/profile.png` (that path does not exist in `public/`). `schema.json` `image` is a `vercel.etarikhi.com/_next/image` URL. The README says `vtarikhi.com`. | `head.jsx`, `schema.json`, `README.md` | Choose one canonical site URL and derive absolute URLs from it (D-5). |
| F-07 | M | **Project thumbnails are downloaded twice.** `unoptimized` `<Image>` loads the thumbnail, and `onLoad` then sets `src` to the full-size image. | `projects.tsx` `handleImageOverride` | Keep the behaviour for parity in Set 4, but flag it for an optimization follow-up. Payload uploads can serve sized variants. |
| F-08 | M | **Missing fallback asset.** `/placeholder.svg` and `/images/placeholder.svg` are referenced but not present in `public/`. | `articles.tsx`, `about.tsx` | Add a real placeholder to `public/` or drop the fallback (Set 4). |
| F-09 | M | **Eye button is labelled and wired incorrectly.** `aria-label` says "Read more about" for the preview button. `data-lightbox="portfolio"` is set, but no lightbox library is loaded (the lightbox CSS and JS are commented out), so it navigates to the full-size image in the same tab (no `target` attribute). | `projects.tsx`, `head.jsx` | Keep the link behaviour. Correct the label (Set 4). Lightbox is a separate decision (D-9). |
| F-10 | M | **Payload thumbnail size is not configured.** The Projects field description says the thumbnail is generated automatically from `media.sizes.thumbnail`, but `Media.ts` has `upload: true` and no `imageSizes`. | `src/collections/Projects.ts`, `src/collections/Media.ts` | Add `imageSizes` to Media, or change the description (Set 7). |
| F-11 | M | **Ascending default sort on date collections.** `Articles` and `Certificates` set `defaultSort: 'publishedAt'` / `'issuedAt'`. Payload uses ascending order for a plain field name. The vTarikhi articles are shown newest first. Certificates are shown oldest first in vTarikhi. | `Articles.ts`, `Certificates.ts`; Payload `find.js` applies `collectionConfig.defaultSort` | Use explicit `sort` in the data layer. Articles: `-publishedAt`. Certificates: `issuedAt` (keeps current order). |
| F-12 | L | `experiences` has an `order` field but no `defaultSort`. | `Experiences.ts` | Add `defaultSort: 'order'` (Set 1 uses explicit sort anyway). |
| F-13 | M | **Free-text icon names.** `services.iconFont` and `footer.*.iconName` are free text. An unknown name silently renders nothing, because `awesomeIcon[name]` is `undefined`. | `services.tsx`, `footer.tsx`, `Services.ts`, `Footer.ts` | Change to `select` options that match the icon maps, or derive icons from `platform` (Set 7). |
| F-14 | M | **Copyright year is hard-coded.** `currentYear` is computed but unused. The UI prints `Copyright © 2023`. | `footer.tsx` | Keep `2023` through the CMS value (D-6). |
| F-15 | M | **Seed data is corrupted.** An excerpt in `src/seed/articles.ts` contains replacement characters (`dünyas��nda`). The source has `dünyasında`. | `src/seed/articles.ts` | Fix in Set 7 and re-seed. |
| F-16 | L | **Debug logging at module scope.** 13 active `console.log` calls, including full JSON dumps. | grep over `components/` and `pages/` | Remove in the refactor. |
| F-17 | L | **Dead and empty files.** `products.tsx` (0 bytes), `global.css`, `styles/home.module.css`, `loader.tsx`, unused `bg-icon.webp`. | §3 | Do not port. Keep in `vTarikhi/` as the reference until sign-off. |
| F-18 | L | **Lockfile drift.** `npm ci` fails on `vTarikhi/package-lock.json`. | §0 | Do not port the lockfile. Dependencies move to the root `pnpm-lock.yaml`. |
| F-19 | L | **Type safety is disabled.** `vTarikhi/tsconfig.json` has `strict: false`. Several props are typed `map;` or `filter;` (implicit `any`). | `services.tsx`, `skills.tsx`, `projects.tsx` | Port with proper types (Set 1). |
| F-20 | L | **Unused or mis-typed props and variables.** `isLoading` in `ProjectSection`. `key` is set on values that are not list items. `ServiceItem` is called as a function, so its `key` is ignored. `delay?: number` is never set. | `projects.tsx`, `services.tsx`, `skills.tsx` | Remove or fix during the port. Rendered DOM must not change. |
| F-21 | L | **README describes features that do not exist.** It promises a contact form and multi-language support. | `README.md` | Update the README when the port lands (Set 7). |
| F-22 | L | **Seed text drifts from the source data.** For example, `Ajax, JavaScript, TypeScript,` (source, trailing comma) is `Ajax, JavaScript, TypeScript` in `src/seed/services.ts`. | `database.json` vs `src/seed/services.ts` | Re-sync the seed from the source during Set 7. The parity tests use the source data as the oracle. |
| F-23 | M | **`pnpm lint` cannot run.** `eslint.config.mjs` imports `@eslint/eslintrc`, which is not a declared dependency and does not resolve from the repo root. The config was already broken before the migration. | `eslint.config.mjs`; `require.resolve('@eslint/eslintrc')` fails | Declare the dependency or use the packages that `eslint-config-next` already provides (Set 7). |
| F-24 | M | **The existing e2e test already fails.** `tests/e2e/frontend.e2e.spec.ts` expects the title `Payload Blank Template` and the heading `Welcome to your new project.`. Neither is in the current homepage. | `tests/e2e/frontend.e2e.spec.ts`; `src/app/(frontend)/page.tsx` | Rewrite the test for the new homepage (Set 7). |

## 8. Parity contract

The following must match the baseline in Set 6 and Set 7 (see §0 for capture). Differences must be listed and approved.

- The same section order and the same `id` anchors: `home`, `about`, `skill`, `service`, `certificate`, `project`, `article`, `contact`.
- The same visible text for every row in §6, including the education join `"<institution> / <location>"` and the article `Issued: <date> • <n> min read` line.
- The same Bootstrap class names and DOM structure per section. The migration is a re-platforming, not a redesign.
- The same interactive behaviour from §4 (typewriter, progress bars, filter, email reveal, back-to-top, collapse).
