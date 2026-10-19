# ADR 0007 — TanStack Table renders the collection list views

- **Status:** Accepted (2026-10-16, decision D7; overrides the analysis' "Payload list views only")
- **Context:** The owner wants AdminCN-style data tables built on TanStack Table. Payload's list view
  also provides things that must keep working: access-controlled queries, search, filters, column
  preferences, query presets, pagination, bulk edit/delete/publish, trash, and the relationship
  picker drawers that reuse the list view.
- **Decision:** Keep Payload's list view and replace only its table.
  - A server component, `TanStackListView` in `src/components/admin/views/List/index.tsx` (moved
    from `list/` by ADR 0009), is registered as `admin.components.views.list.Component` for every
    collection by the `adminUI` config plugin. It renders Payload's `DefaultListView` and passes a
    custom `Table`.
  - The table (`DataTable.tsx`, client) is a headless TanStack Table v9 instance (`useTable` with
    `tableFeatures`, the current stable major and the pattern used in shadcnstudio's table
    masterclass) over the documents Payload already fetched. Cells are the
    server-rendered cells from Payload's column state, so custom `Cell` components, relationship
    labels and the drawer "select" behaviour keep working.
  - Sorting is manual: TanStack's sorting state is derived from the `?sort=` query and changes call
    `useListQuery().handleSortChange`. Pagination, search, filters and column visibility stay with
    Payload (URL + user preferences).
  - Row selection is bridged to Payload's `useSelection()`, so bulk actions keep working.
  - Group-by and `orderable` collections fall back to Payload's table.
  - A collection can opt out with `custom: { tanstackList: false }`.
- **Consequences:** The list views get the shadcn table design, sticky headers, accessible sort
  buttons with `aria-sort` and selection checkboxes, without forking Payload's data layer. If
  Payload changes `DefaultListView`'s props, only `TanStackListView.tsx` needs to change.
- **Alternatives considered:** Payload's table with CSS only (no TanStack); a fully custom list view
  with its own queries (would duplicate access control, presets and bulk actions).

## Implementation notes (P5, 2026-10-16)

- `src/plugins/adminUI.ts` registers `TanStackListView` as the list view of every collection that
  does not define its own (singletons keep `SingletonListView`), is not `orderable`, and does not set
  `custom: { tanstackList: false }`. It also gives checkbox fields the `BooleanCell` (Payload's
  default cell printed the raw key `general:null` for unset values).
- `TanStackListView` (server) strips the server-only props and renders Payload's `DefaultListView`,
  replacing only its `Table` prop. Grouped (`groupBy`) and orderable tables are detected from the
  element Payload built and are left to Payload.
- `DataTable` (client) is a TanStack Table v9 instance (`useTable`, `tableFeatures({
  columnVisibilityFeature })`). Column definitions wrap the headings and cells Payload rendered on
  the server, so sorting (`SortColumn`), selection (`SelectAll`/`SelectRow` + `useSelection`),
  links, drawer selection and custom `Cell` components behave exactly as before. Payload's
  `heading-*` ids, `cell-*` classes, `row-N` classes and `data-id` attributes are kept.
- Relationship/upload drawers reuse the collection's list view, so they get the same table.
- `LazyDataTable` loads the table through `next/dynamic` (server rendering kept), so TanStack Table
  is fetched only on pages that show a list, not on every admin page.
- Field cells: `ProgressCell` (Skills value), `ContextColorCell` (Skills color swatch).
- Tests: `tests/e2e/list.e2e.spec.ts` (table present, selection state, sort via URL).
