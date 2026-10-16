# PoCMS admin UI guide

How the customised Payload admin is put together and how to extend it. The decisions behind it are
in [`adr/`](./adr/README.md); the original analysis and roadmap are in
[`shadcn-payload-ui-analysis.md`](./shadcn-payload-ui-analysis.md).

The admin is still Payload's admin (Payload 3.9x). Nothing replaces Payload's routing, forms, list
state or access control. The work adds four layers on top:

1. **Design tokens** that restyle Payload's own UI (colours, type, radius, dark theme).
2. **An isolated Tailwind v4 build** (`acn:` prefix, no Preflight) for custom admin components.
3. **Base UI primitives** in shadcn's `base-vega` style, used by custom components only.
4. **Custom admin features** built on Payload's extension points: branding, navigation, dashboard
   widgets, TanStack list tables, list cells, one-document collections and roles.

## Where things live

| Path                                                 | What it is                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `src/styles/admin/tokens.css`                        | Tier 0-2 design tokens and the mapping onto Payload's variables |
| `src/styles/admin/payload-overrides.css`             | Small, documented overrides of Payload classes                  |
| `src/styles/admin/admin-ui.css`                      | Tailwind v4 entry: `prefix(acn)`, theme bridge, scoped reset    |
| `src/styles/admin/shadcn.css`                        | Ejected `tw-animate-css` variants used by the primitives        |
| `src/components/admin/providers/AdminUIProvider.tsx` | Loads the admin styles and Inter                                |
| `src/components/admin/ui/*`                          | Base UI primitives (button, select, dialog, table, chart, ...)  |
| `src/components/admin/lib/utils.ts`                  | `cn()` with a prefix-aware `tailwind-merge`                     |
| `src/components/admin/graphics/*`                    | Logo, Icon, initials avatar                                     |
| `src/components/admin/nav/*`                         | Sidebar Create menu, View site and UI kit links                 |
| `src/components/admin/dashboard/*`                   | Dashboard widgets and their config                              |
| `src/components/admin/list/*`                        | TanStack list view, data table and list cells                   |
| `src/components/admin/views/*`                       | UI kit page, singleton list redirect                            |
| `src/plugins/adminUI.ts`                             | Applies the list view and boolean cells to every collection     |
| `src/access/roles.ts`, `src/access/singleton.ts`     | Roles helpers, one-document create access                       |

The living style guide is at **`/admin/ui-kit`** (admins only). It renders every token and
primitive inside Payload's shell, in the current theme.

## Design tokens

`tokens.css` is layered in tiers, all inside `@layer payload` (ordered after Payload's own
`payload-default` layer, so no `!important` is needed):

- **Tier 0, brand primitives**: the site's amber and navy, in hex (the contrast script parses them).
- **Tier 1, Payload theme variables**: what Payload's own UI reads. We set `--font-body` (Inter),
  `--style-radius-s/m/l` (6/8/12 px), the focus outline and, in dark mode, a navy-tinted
  `--theme-elevation-*` scale.
- **Tier 2, semantic tokens** (shadcn names: `--background`, `--foreground`, `--card`,
  `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--success`,
  `--warning`, `--border`, `--input`, `--ring`, `--chart-1..5`). They are defined _from_ Payload's
  variables, so the primitives follow Payload's theme switch automatically.
- **Tier 3, Tailwind utilities**: the `@theme inline` block in `admin-ui.css` maps Tier 2 onto
  `acn:*` classes (`acn:bg-card`, `acn:text-muted-foreground`...).

Light and dark values live side by side (`[data-theme='dark']`). Payload's theme switch (account
page or the UI kit) toggles both Payload and the custom components.

Change the brand colour by editing the Tier 0 amber values, then run `pnpm check:contrast`: it
checks 34 foreground/background pairs against WCAG AA in both themes and fails CI if one drops
below the threshold. Warning colours never carry meaning alone; they always come with an icon and
a label.

**Spacing** follows Payload's scale: Tailwind's `--spacing` is `calc(var(--base) / 5)` = 4 px, so
`acn:p-5` equals Payload's `--base` (20 px). Payload's root font size is 13 px; Tailwind sizes are
expressed against it through the theme bridge, so `acn:text-sm` matches Payload's body text.

### Payload 4 readiness

Payload 4 replaces the Sass variables with its own semantic tokens. Only Tiers 1 and 2 reference
Payload's names, so an upgrade means re-pointing these lines; components use Tier 2/3 and don't
change. Current mapping (light / dark where they differ):

| Our token (Tier 2)        | Defined from (Payload 3)                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--background`            | `--theme-bg`                                                                                                       |
| `--foreground`            | `--theme-text`                                                                                                     |
| `--card`, `--popover`     | `--theme-elevation-0` / `--theme-elevation-50`                                                                     |
| `--muted`                 | `--theme-elevation-50`                                                                                             |
| `--muted-foreground`      | `--theme-elevation-600` (Payload flips the scale in dark mode)                                                     |
| `--secondary`, `--accent` | `--theme-elevation-100`                                                                                            |
| `--border`, `--input`     | `--theme-elevation-150`                                                                                            |
| `--primary`               | Tier 0 `--brand-amber-700` / `--brand-amber-500` (Payload's primary button is restyled in `payload-overrides.css`) |
| `--destructive`           | `--theme-error-*`                                                                                                  |
| `--success`               | `--theme-success-*` (Payload's blue scale)                                                                         |
| `--warning`               | `--theme-warning-*`                                                                                                |

Tier 1 values we set on Payload itself: `--font-body`, `--style-radius-s/m/l`, the dark
`--theme-elevation-*` scale and the focus outline.

Other v4 notes: run `npx @payloadcms/codemod`, check the renamed admin component keys, and plan for
the new defaults (`overrideAccess: false` in the Local API, which our widgets already use).

## Tailwind in the admin

- Every utility carries the **`acn:` prefix** (`acn:flex acn:gap-2`), so Tailwind classes can't
  collide with Payload's class names (`.table`, `.container`, `.btn`...). Tailwind v4 only accepts
  a letters-only prefix used as a variant, hence `acn:` rather than `acn-`.
- There is **no Preflight**. A small reset applies only to elements with a `data-slot` attribute
  (the primitives); Payload's markup is untouched.
- Tailwind scans only `src/components/admin` (`@source` in `admin-ui.css`). Classes written
  elsewhere are not generated.
- `pnpm check:tw-prefix` parses every admin file (TypeScript AST: `className`, `cn()`, `cva()`
  including variants and compound variants) and fails on unprefixed utilities.
- `cn()` merges prefixed classes correctly (`extendTailwindMerge({ prefix: 'acn' })`).
- Prettier sorts admin classes (`prettier-plugin-tailwindcss`, admin files only).
- The dev server caches class candidates. After fixing an invalid class (for example an unquoted
  attribute selector), restart `pnpm dev` if the old CSS error persists.

## Adding a primitive

`components.json` is set up for shadcn's `base-vega` style with the `acn` prefix and the admin
aliases, plus the shadcnstudio registries.

```bash
pnpm dlx shadcn@latest add @shadcn/<component>
pnpm check:tw-prefix && pnpm typecheck
```

The CLI applies the prefix to new files. Check by hand what it is known to miss: quoted attribute
selectors (`[stroke='#ccc']`), class names used as object keys inside `cn()`, and `compoundVariants`.
Add the component to the UI kit and run the e2e axe tests (`tests/e2e/ui-kit.e2e.spec.ts`).

Base UI notes: a `Button` rendered as a link needs `render={<a />}` and `nativeButton={false}`;
`Select` needs `items` to show labels in the trigger; `ToggleGroup` values are arrays; a Base UI
checkbox is a `span[role=checkbox]`, so name it with `aria-labelledby` or `aria-label`.

## Navigation and branding

- `graphics.Logo` (login) and `graphics.Icon` (breadcrumb) use the site's favicon set.
- `admin.meta` sets the `· PoCMS` title suffix and the icons.
- Sidebar groups come from `admin.group`: **Content**, **Profile**, **Admin**. Payload orders
  groups by first appearance, collections before globals, so the collection order in
  `payload.config.ts` sets the group order.
- `beforeNavLinks`: the **Create** control lists only collections the user may create. It is a
  native disclosure (`details`/`summary`) holding links, closed by Escape or an outside click.
- `afterNavLinks`: **View site** (`NEXT_PUBLIC_SITE_URL`, or the same origin), the **UI kit** for
  admins and **Collapse sidebar**.
- `settingsMenu` (gear): **Refresh site cache**, for every signed-in user. It calls
  `POST /api/revalidate-site` (`src/endpoints/revalidateSite.ts`), which expires the `portfolio`
  cache tag at once (`expire: 0`). Saves only mark it stale, so the first visitor after a save can
  still get the old page; seeds, imports and database edits don't touch it at all. Don't put
  role-specific items here: the popup opens empty for users whose items all render nothing.
- `actions` (header): the command menu button and the light/dark switch
  (`header/ThemeToggle.tsx`, through Payload's `useTheme`, so the choice is Payload's own theme
  cookie).
- `admin.dateFormat` is `d MMM yyyy, HH:mm`. Fields with their own `date.displayFormat` keep it.

### Command menu

- **Ctrl+K / Cmd+K** anywhere in the admin, or the **Search…** button in the header
  (`command/CommandMenuTrigger.tsx`, the only part on every page). The menu itself
  (`command/CommandMenu.tsx`) is a separate chunk, fetched when the pointer reaches the button or on
  the first shortcut.
- Groups: **Recent** (documents and globals you opened, kept in localStorage, named from the edit
  view heading), **Go to** (dashboard, every collection and global you can see, account, UI kit
  for admins), **Create** (collections you may create in), **Documents** (title search) and
  **Actions** (theme, sidebar, refresh site cache, view site, log out).
- Document search: two or more letters search each readable collection's `useAsTitle` field over
  REST with the user's own access (`like`, four hits per collection, debounced, stale requests
  aborted). Collections titled by `id` are skipped.
- Ranking (`command/match.ts`): prefix beats word start beats substring, every query word must
  match the label or a keyword, accents and case are ignored. With a query, the group holding the
  best match comes first, so Enter runs the most likely command.
- Accessibility: Base UI dialog; the input is an ARIA combobox controlling a grouped listbox
  (`aria-activedescendant`); arrow keys move, Enter runs, Escape closes. Covered by axe in
  `tests/e2e/command-menu.e2e.spec.ts`.
- To add a command, add an item to the list in `CommandMenu.tsx` (group, label, keywords, icon,
  `run`).

### Theme switch animation

Switching the theme (header button or command menu) spreads the new theme as a circle from the
button, with the View Transitions API (`header/themeTransition.ts`, styles at the end of
`nav-rail.css`). Browsers without the API, and users who prefer reduced motion, get an instant
switch.

### Sidebar icons and the icon rail

- Every sidebar link gets a Lucide icon as a CSS mask, keyed to Payload's nav ids (`#nav-<slug>`,
  `#nav-global-<slug>`). Payload's nav markup is untouched. The icons are generated:
  add the collection or global to `NAV_ICONS` in `scripts/generate-nav-icons.mjs` and run
  `pnpm generate:nav-icons` (part of `generate:all`, so CI catches a stale
  `src/styles/admin/nav-icons.css`). Links without an entry get a generic file icon.
- **Collapse sidebar** (desktop, 1025 px and up) shrinks the open sidebar to a 4rem icon rail.
  Payload's own toggler still hides the sidebar completely, and smaller screens keep Payload's
  overlay. The state is a cookie (`pocms-nav-rail`), so the server renders the rail directly on the
  next visit, and a `data-nav-rail` attribute that `nav-rail.css` reads with `:has()`.
- In the rail, labels are hidden visually only (links keep their accessible names), the group
  headings become separators, collapsed groups stay visible and hover or keyboard focus shows a
  tooltip with the label. Create becomes an icon and its menu opens to the right.
- Payload marks the _closed_ sidebar `inert`, which is why the rail is a width mode of the open
  sidebar rather than a styled closed one.

### Article Live Preview

- Articles set `admin.livePreview.url` and `admin.preview` to the article page, but only for
  articles that have a page (slug and body, `hasArticlePage`). The others have no preview.
- The page renders the article on the server as before. `ArticleLivePreviewSwitch` (a few hundred
  bytes) checks whether the page runs inside a frame; only then does it load `ArticleLivePreview`
  (`@payloadcms/live-preview-react`) as a separate chunk, which renders the editor's unsaved form
  state. Public visitors download none of it.
- The live renderer needs the saved document's `id` (Payload resolves the draft's cover image
  for it), which is why the article view model includes `id`.

## Dashboard widgets

Widgets are server components registered in `src/components/admin/dashboard/config.ts`
(`admin.dashboard`). Users can rearrange, resize, remove and re-add them; layouts are saved in
their preferences, and `defaultLayout` applies until they change it.

To add a widget:

1. Write a server component that receives `WidgetServerProps` (`req`, `user`, `permissions`,
   `widgetData`). Query through `req.payload` with `req` and `overrideAccess: false`.
2. Wrap the content in `WidgetCard` (or give the root `data-dashboard-widget` for the axe test).
3. Add it to `widgets` (and to `defaultLayout` if everyone should see it). Use `fields` for
   per-instance settings, as the **Content count** widget does for its collection.
4. Run `pnpm generate:types` (widget slugs are typed) and `pnpm generate:importmap`.

The publishing chart is plain server-rendered HTML (bars plus a visually hidden table), so the
dashboard adds no chart library to the bundle.

## Bundle size

Payload's admin is one Next.js route, so every client component reachable from the import map is
shipped to every admin page. Keep heavy parts behind a small `'use client'` wrapper that calls
`next/dynamic`, and reference the wrapper from the config: see `UIKitLazy`, `LazyDataTable`,
`ServiceIconField` and `IconCell`, or load on first use with `import()` like the command menu.
Prefer server components and native elements for things that render everywhere (nav, avatar).
Budget (raised to +150 kB JS / +40 kB CSS over the P0 baseline) and current numbers:
[`perf-budget.md`](./perf-budget.md).

## List views

`src/plugins/adminUI.ts` gives every collection the **TanStack list view** unless it defines its own
list view, is `orderable`, or sets `custom: { tanstackList: false }`. The view keeps Payload's
`DefaultListView` (toolbar, search, filters, columns, bulk actions, pagination, URL state) and swaps
only the table for a TanStack Table v9 instance. Headings and cells are the ones Payload rendered,
so sorting, selection, links, drawers and custom cells behave as before. Grouped lists fall back to
Payload's table.

Custom cells are ordinary Payload `admin.components.Cell` components (client components receiving
`DefaultCellComponentProps`): see `list/cells/` for the boolean, progress and colour cells. The
plugin adds the boolean cell to every checkbox field that has no cell of its own.

**One-document collections** (Header, About): `access.create` is `createWhileEmpty(slug)`, and the
list view (`SingletonListView`) redirects to the document, or to the create form when there is none.

### List summary

`adminUIPlugin` adds `ListSummary` (`beforeListTable`) to every collection: total, edited in the
last 30 days, last edit and collection-specific counts from `list/summaryFacts.ts` (articles with
a page, featured and without an image; projects without an image; admins and editors). Counts use
the signed-in user's access and ignore the current search and filters; a failing count is logged
and left out. It is a server component, so it adds no client JavaScript. Opt out with
`custom: { listSummary: false }`.

### Typography

Body text is 14px instead of Payload's 13px (`tokens.css`). Payload computes `--base` as
`20 / --base-body-size` rem, so raising both keeps `--base` at 20px and the spacing scale at 4px:
only text grows.

## Roles

Users have `roles` (`admin`, `editor`; new users are editors, the first user is an admin).

- Admins manage users and roles and see admin-only tools (Users, UI kit).
- Editors manage content and their own account; they can't change roles.
- The last admin can't be demoted or deleted (`ensureAdminExists`).

Helpers are in `src/access/roles.ts`; the behaviour is covered by `tests/int/roles.int.spec.ts`.

## Generated files

`src/payload-types.ts`, `src/payload-generated-schema.ts`, `schema.graphql` and the import map are
committed. Regenerate them only with:

```bash
pnpm generate:all
```

The wrapper (`scripts/generate.mjs`) supplies a placeholder Vercel Blob token when none is set, so
the output is the same with or without a real token. The dev server doesn't rewrite the types
(`typescript.autoGenerate: false`). CI regenerates everything and fails if a file differs.

## Checks

```bash
pnpm typecheck          # TypeScript
pnpm lint               # ESLint
pnpm check:tw-prefix    # admin classes carry the acn: prefix
pnpm check:contrast     # token pairs meet WCAG AA in both themes
pnpm test:int           # Vitest + Local API (roles, singletons, API)
pnpm test:e2e           # Playwright: admin, navigation, dashboard, lists, UI kit (axe)
pnpm test:visual        # screenshot comparisons
```

The e2e axe tests check WCAG 2.2 AA (serious and critical findings) for the UI kit and dashboard
widgets in both themes. Performance budgets and how to measure them are in
[`perf-budget.md`](./perf-budget.md).
