# Admin components

The custom components of the PoCMS admin. The admin is Payload's own (Payload 3.9x); these files
plug into the places Payload documents for custom components, and the folders are named after
those places. How to build and extend them: [admin UI guide](../../../docs/ui-modernization/admin-ui-guide.md).

Payload finds a component through its **Component Path** in the config, relative to
`admin.importMap.baseDir` (`src`): `/components/admin/<folder>/<Name>#<Export>`. A folder path
resolves to its `index.tsx`. Payload writes every path into the generated import map
(`src/app/(payload)/admin/importMap.js`), so run `pnpm generate:importmap` after adding, moving or
renaming one. `/admin/gallery` lists every registered path, read from the running config, next to
the live components.

## Layout

| Folder | Payload config key | Payload docs |
| --- | --- | --- |
| `graphics/` | `admin.components.graphics.Logo`, `.Icon`; `admin.avatar` | [Root Components](https://payloadcms.com/docs/custom-components/root-components) |
| `providers/` | `admin.components.providers` | [Custom Providers](https://payloadcms.com/docs/custom-components/custom-providers) |
| `actions/` | `admin.components.actions` (header) | [Root Components: actions](https://payloadcms.com/docs/custom-components/root-components#actions) |
| `nav/` | `admin.components.beforeNavLinks`, `afterNavLinks`, `logout.Button` | [Root Components](https://payloadcms.com/docs/custom-components/root-components) |
| `views/` | `admin.components.views.*`; a collection's `admin.components.views.list.Component` and `beforeListTable` | [Custom Views](https://payloadcms.com/docs/custom-components/custom-views), [List View](https://payloadcms.com/docs/custom-components/list-view) |
| `widgets/` | `admin.dashboard.widgets`, `admin.dashboard.defaultLayout` (`widgets/config.ts`) | [Dashboard Widgets](https://payloadcms.com/docs/custom-components/dashboard) |
| `fields/` | a field's `admin.components.Field` and `.Cell` | [Field components](https://payloadcms.com/docs/fields/overview#custom-components) |
| `elements/` | not registered: building blocks the components above are made of, like `@payloadcms/ui`'s `elements/` | |
| `hooks/` | not registered: shared React hooks | |
| `utilities/` | not registered: plain functions (`cn`, collection labels and URLs, dates, theme transition) | |

```text
src/components/admin/
├── actions/
│   ├── AccountMenu/        index.tsx: name, role, account settings, log out
│   ├── CommandMenu/        index.tsx: Search button + shortcuts; Menu.tsx (lazy), match.ts, recent.ts, shortcuts.ts
│   ├── DevTools/           index.tsx (server, Developer tools capability); Menu.tsx (client)
│   └── ThemeToggle/        index.tsx
├── elements/               Avatar, Badge, Button, Card, Checkbox, Dialog, DropdownMenu, Field, Input,
│                           InputGroup, Label, OptionTiles, Popover, Progress, Select, Separator,
│                           Skeleton, Table, Tabs, Textarea, Toggle, ToggleGroup, Tooltip, WidgetCard
├── fields/
│   ├── Checkbox/           Cell.tsx (added to every checkbox field by src/plugins/adminUI.ts)
│   ├── ContextColor/       Field.tsx, Cell.tsx, colors.ts (Skills › color)
│   ├── FileSize/           Cell.tsx (Media › filesize)
│   ├── Progress/           Cell.tsx (Skills › value)
│   └── ServiceIcon/        Field.tsx → Picker.tsx (lazy), Cell.tsx → CellView.tsx (lazy), icons.ts
├── graphics/               AccountAvatar/, Icon/, Logo/
├── hooks/                  useDismissable.ts
├── nav/
│   ├── HiddenLogout/       logout.Button (log out lives in the account menu)
│   ├── NavExtraLinks/      afterNavLinks: View site, Component gallery
│   ├── QuickCreate/        beforeNavLinks: index.tsx (server, permissions) → Menu.tsx (client)
│   └── SidebarToggle/      beforeNavLinks: index.tsx (server, cookie) → Button.tsx, navRail.ts
├── providers/
│   └── AdminUIProvider/    loads the admin stylesheet and Inter
├── utilities/              cn.ts, collections.ts, dates.ts, themeTransition.ts
├── views/
│   ├── Gallery/            /admin/gallery: index.tsx (server), registry.ts, Registry.tsx, Section.tsx,
│   │                       previews.tsx, Elements.tsx via ElementsLazy.tsx
│   ├── Jobs/               /admin/jobs: index.tsx (server, Scheduled jobs capability),
│   │                       Actions.tsx (client: Run now, Cancel)
│   ├── List/               index.tsx (TanStack list view), DataTable.tsx via DataTableLazy.tsx,
│   │                       ListSummary.tsx + summaryFacts.ts (beforeListTable)
│   └── SingletonList/      list view of Header and About: redirects to the one document
└── widgets/
    ├── config.ts           widget definitions and the default layout (imported by payload.config.ts)
    ├── CIStatus/           ci-status
    ├── ContentCount/       content-count
    ├── ContentHealth/      content-health
    ├── Deployments/        deployments
    ├── PageSpeed/          page-speed
    ├── PublishingActivity/ publishing-activity: index.tsx (server), ChartLazy.tsx → Chart.tsx, data.ts
    ├── RecentChanges/      recent-changes
    ├── SiteTraffic/        site-traffic
    └── Welcome/            welcome
```

## Conventions

- **One folder per component**, PascalCase, as in Payload's own UI package. `index.tsx` is the file
  the config points at; parts it needs sit next to it (`Menu.tsx`, `Chart.tsx`, `data.ts`). Field
  folders name their files after the config key: `Field.tsx`, `Cell.tsx`.
- **Server Components by default**, as Payload recommends. Add `'use client'` only where the
  component needs state or browser APIs, and pass it serializable props. Server components read data
  through `req.payload` with `req` and `overrideAccess: false`.
- **Heavy client code loads on demand.** Payload's admin is one route, so every client component in
  the import map ships to every admin page. Register a small wrapper and load the rest with
  `next/dynamic` or `React.lazy` from a sibling file (`*Lazy.tsx`, `Field.tsx` → `Picker.tsx`).
- **Imports:** Payload's hooks and components from `@payloadcms/ui`; this project's as
  `@/components/admin/<folder>/<Name>`; files in the same folder as `./name`.
- **Styling:** Tailwind classes with the `acn:` prefix on design tokens (`acn:bg-card`,
  `acn:text-muted-foreground`), never hex values. Overrides of Payload's own classes go in
  `src/styles/admin` inside `@layer payload` (see the guide).
- **Every component is in the gallery.** Registered components show up in its registry
  automatically; add a live preview to `views/Gallery/previews.tsx` and, for a new element, a demo
  to `views/Gallery/Elements.tsx`.

## Third-party code

The elements Avatar, Badge, Button, Card, Checkbox, Dialog, DropdownMenu, Field, Input, InputGroup,
Label, Popover, Progress, Select, Separator, Skeleton, Table, Tabs, Textarea, Toggle, ToggleGroup and
Tooltip, and `src/styles/admin/variants.css`, started as shadcn/ui `base-vega` components (MIT,
© shadcn) by way of the AdminCN template (MIT, © 2026 shadcn/studio). They are maintained here now:
every class carries the `acn:` prefix (`pnpm check:tw-prefix` checks it) and they read the admin's
tokens, so they follow Payload's light and dark themes.
