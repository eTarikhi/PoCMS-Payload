# ADR 0007 — TanStack Table renders the collection list views

- **Status:** Accepted (2026-10-16, decision D7; overrides the analysis' "Payload list views only")
- **Context:** The owner wants AdminCN-style data tables built on TanStack Table. Payload's list view
  also provides things that must keep working: access-controlled queries, search, filters, column
  preferences, query presets, pagination, bulk edit/delete/publish, trash, and the relationship
  picker drawers that reuse the list view.
- **Decision:** Keep Payload's list view and replace only its table.
  - A server component (`src/components/admin/list/TanStackListView.tsx`) is registered as
    `admin.components.views.list.Component` for every collection by the `adminUI` config plugin. It
    renders Payload's `DefaultListView` and passes a custom `Table`.
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
