# ADR 0009 — Admin components laid out by Payload slot, no template tooling

- **Status:** Accepted (2026-10-19). Amends ADR 0001 (where the primitives live, no shadcn CLI).
- **Context:** `src/components/admin` had grown in the shape of the templates it started from:
  shadcn-generated primitives in `ui/` (kebab-case files), `lib/utils.ts`, a `components.json` for
  the shadcn CLI with shadcnstudio registries, and feature folders (`command/`, `header/`, `list/`,
  `dashboard/`) that didn't say where Payload renders their contents. `header/` even clashed with
  Payload's `admin.components.header` slot, which is something else. The owner asked for a
  Payload-native structure, based on Payload's documentation and not on a ready template (AdminCN,
  shadcn), keeping the libraries (Base UI, Tailwind `acn:`, TanStack Table) and turning the UI kit
  into a gallery of the admin's own components.
- **Decision:**
  - Folders follow the places Payload's docs define for custom components, named after the config
    keys: `graphics/` (`admin.components.graphics`, `admin.avatar`), `providers/`, `actions/`
    (header actions), `nav/` (`beforeNavLinks`, `afterNavLinks`, `logout.Button`), `views/`
    (custom views and the collection list view), `widgets/` (`admin.dashboard`) and `fields/`
    (a field's `Field` and `Cell`). Unregistered code goes in `elements/`, `hooks/` and
    `utilities/`, the names Payload's own UI package uses.
  - One PascalCase folder per component with `index.tsx` as the entry; parts beside it. Component
    Paths become `/components/admin/<folder>/<Name>#<Export>`.
  - The primitives are ordinary elements (`elements/Button/index.tsx`, …), maintained in this
    repository. `components.json` is removed; the shadcn CLI and registries are no longer part of
    the workflow. Licence notices for the adapted code are kept in
    `src/components/admin/README.md`.
  - `/admin/ui-kit` becomes **`/admin/gallery`**: a registry of every registered component read
    from the running config, live previews of graphics, widgets, the list summary, field
    components (inside a Payload `Form`) and cells, then the element demos (lazy chunk).
  - Unused code goes: the `combobox` and `scroll-area` primitives, and the Recharts-based `chart`
    primitive with the `recharts` package (the gallery shows the dashboard's own chart).
- **Consequences:**
  - The config reads like Payload's docs: the folder in a Component Path names the slot.
  - Imports across folders use `@/components/admin/...`, so moving a file inside its folder
    doesn't ripple. Payload's import map must be regenerated after any move
    (`pnpm generate:importmap`; CI fails on a stale one).
  - Adding an element means writing it by hand (or adapting upstream code) with the `acn:` prefix;
    `pnpm check:tw-prefix` catches misses.
  - Building the gallery exposed a bug the UI kit had: a custom view must take `permissions`,
    `locale` and `visibleEntities` from `initPageResult` (they aren't top-level props), otherwise
    the sidebar loses its groups and the Create menu.
- **Alternatives considered:** keeping the template layout and only renaming (no gain in
  findability); replacing the elements with `@payloadcms/ui` components (rejected by the owner for
  now: restructure only).
