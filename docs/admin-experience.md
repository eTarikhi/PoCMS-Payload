# Admin editor experience

This document defines the editor experience for the PoCMS Payload admin panel. It is the
baseline for every admin customization in this repository: Payload stays in charge of all
core content-management workflows, and we only change what measurably helps editors.

## Who edits content

| Persona | Goals | Frequency |
| --- | --- | --- |
| Portfolio owner | Publish articles and projects, keep the homepage fresh, refresh media | Weekly |
| Assistant editor | Draft articles, upload media, fix typos, reorder lists | Occasional |
| Administrator | Manage users, footer links, site-wide settings | Rare |

## Most common tasks (in order)

1. **Reach Articles or Projects quickly** — open the list, find a draft, keep editing.
2. **Check content status** — what was changed recently, what is featured on the homepage,
   which entries are missing a cover image or a link.
3. **Create or update an article** — title, excerpt, slug, publish date, cover image.
4. **Manage media** — upload an image, give it alt text, reuse it in articles/projects.
5. **Tweak global content** — hero/header text, footer social links.
6. **Occasionally** — manage users, order experience/skills/services lists.

## Pain points we are solving

- Reaching Articles/Projects took too many clicks (flat nav, no dashboard shortcuts).
- No at-a-glance answer to "what changed?" or "what is missing?".
- The stock dashboard showed collection cards only, with no task focus.
- Branding did not match the portfolio, which made the admin feel like a foreign tool.

## What stays untouched

Payload keeps full ownership of these workflows — we decorate them, never replace them:

- List views: filters, search, column selection, pagination, bulk actions, query presets.
- Document edit views: form state, autosave, versions, drafts/publish, live preview.
- Authentication flows: login, logout, forgot password, account, sessions.
- Access control and permissions enforcement (we only *visualize* permissions).
- The REST/GraphQL APIs and the Local API.

## Information architecture

Sidebar groups (Payload `admin.group`), in editorial priority order:

| Group | Contains | Why |
| --- | --- | --- |
| **Content** | Articles, Projects, Media | The everyday surface |
| **Portfolio** | About, Header, Experiences, Educations, Skills, Services, Certificates | Structured profile content |
| **Site** | Footer (global) | Site-wide chrome |
| **Administration** | Users | Rare, keep out of the way |

## Dashboard (home view)

The dashboard is a task hub built from Payload's modular dashboard widgets
(`admin.dashboard.widgets`), with the built-in collections widget kept at the bottom:

1. **Content overview** — counts for the collections editors touch most, each linked to its list.
2. **Quick actions** — one-click "Create …", media upload, footer edit, view live site.
3. **Recent activity** — the most recently updated documents across collections.
4. **Needs attention** — content gaps (missing cover images, missing project links) with
   links to filtered list views.
5. **Collections** — Payload's built-in cards for everything else.

Widgets are React Server Components that use the Local API server-side and respect the
logged-in user's permissions, so editors only see what they can act on.

Widget settings are user-editable: the **Content overview** widget has an edit drawer
(title and which collections to count) stored per user in dashboard preferences. The
layout itself is drag-and-drop customisable ("Edit Dashboard") and resettable.

## Editor workflows

- **Live Preview** — the article edit view opens `/articles/{slug}` in the responsive
  preview iframe (mobile 375 / tablet 768 / desktop 1440 breakpoints) whenever the
  article has a page. The Preview button opens the same URL in a new tab.
- **Cache refresh** — saving content in the admin refreshes the live-site cache
  automatically. After out-of-band changes (seeds, imports, manual DB edits), use
  "Refresh live site cache" in the admin gear menu (POST `/api/revalidate`, admin
  users only).

## Screen-level customization policy

- Customize only high-value screens: the dashboard, and a slim summary strip
  (`beforeList`) on Articles, Projects, and Media.
- Prefer decorating/wrapping Payload defaults over reimplementing them.
- Any custom component lives under `src/admin/`, ships its own stylesheet, and uses
  Payload theme variables (`--theme-*`) so light/dark mode keeps working.

## Branding and theme

- `src/app/(payload)/custom.scss` is the only global admin stylesheet. It overrides Payload
  CSS variables and a few BEM selectors; frontend styles are never imported into the admin.
- Brand accents come from the portfolio frontend: amber `#da9100`, gold `#ffc448`,
  ink `#12141d`.
- Custom `Icon` (nav) and `Logo` (login) live in `src/admin/graphics/`.

## Accessibility and responsiveness

- Custom components use semantic links/buttons and visible focus states.
- Layouts are fluid; Payload's responsive nav/table behavior is preserved (verified at
  mobile 375px, tablet 768px, and desktop widths).

## Visual theme

The theme in `src/app/(payload)/custom.scss` covers every admin page and element,
not just the dashboard. All rules sit in `@layer payload`, so they win against
Payload's native styles in `@layer payload-default` without fighting specificity,
and frontend styles are never imported.

What is restyled (18 sections):

- **Tokens first** — brand amber/gold/ink, warm paper canvas + floating white
  surfaces (light) and an ink-tinted dark ramp (`html[data-theme='dark']`),
  radius scale `--style-radius-s/m/l` (5/8/12px), `--font-body` = Open Sans,
  shell rhythm (`--nav-width`, `--gutter-h`, header/doc-controls heights).
- **Typography** — the user-visible "small fonts" fix: `html` base 14px (13px on
  tablets), body/inputs 13–14px, list tables 13.5px, document title 22px, and
  crisp 11px uppercase meta labels (group labels, table headers, pills) so
  small ≠ cramped.
- **Every surface** — login/auth (`template-minimal` brand backdrop, logo
  lockup, 42px inputs), app header (blur, "View site" action pill), navigation
  (rounded links, amber active bar), list views (list header, controls, sortable
  tables, paginator, per-page, no-results), document edit views (doc header,
  doc tabs, sidebar panels, save bar), fields (inputs, checkbox/radio pills,
  react-select, relationship, upload/file-details, datepicker, code/JSON),
  arrays/blocks/collapsibles/groups, relationship tables, bulk upload, popups,
  drawers, confirmation modals, toasts (accent bars), where builder, dashboard
  cards, folder cards, locked-doc banners, verification, and the Live Preview
  toolbar.
- **Open Sans in the admin** — `src/admin/brand/AdminFonts.tsx` (header slot)
  renders the stylesheet link (a plain CSS `@import` is dropped by the
  bundler); offline the system sans fallback stack applies.

Extras beyond restyling: app-header "View site" shortcut on every page
(`HeaderViewSiteButton`), reduced-motion support, subtle row-hover/selected
states for dense tables, and hover-lift cards for faster visual scanning.

## Validation checklist

- [ ] Login → dashboard → list → edit flows work unchanged for an editor user.
- [ ] Widgets and summary strips respect permissions (hide actions the user cannot perform).
- [ ] Light and dark themes both readable.
- [ ] Login, list, edit, account, drawers and modals all show the PoCMS theme (not native Payload).
- [ ] Body/input text renders at the 13–14px scale; meta labels are 11px uppercase, not tiny lowercase.
- [ ] Live Preview iframe and Preview button open the article page for articles with a body.
- [ ] "Refresh live site cache" (gear menu) returns `{"revalidated":true}` for signed-in users.
- [ ] `pnpm generate:types`, `pnpm generate:importmap`, `pnpm lint`, `pnpm test` pass.
