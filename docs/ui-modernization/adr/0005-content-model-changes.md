# ADR 0005 — Content-model changes: pre-approved, additive only

- **Status:** Accepted (2026-10-16, decision D5 — "skip approve")
- **Context:** The analysis proposed several content-model changes and recommended approving each
  one separately. The owner waived the per-change approval. The schema is pushed in development and
  `src/migrations` is git-ignored, so every change must be safe on an existing production database
  and must not change what the public site renders.
- **Decision:** Content-model changes are allowed when they are **additive and non-destructive**:
  new optional columns or tables, admin-only behaviour, and UI over existing stored values. Nothing
  is renamed, dropped or re-typed, and stored values keep their format.
  - **Implemented:**
    - Users: `roles` (ADR 0008) and an optional display `name`.
    - Media: optional `caption`, `focalPoint`, image sizes (`thumbnail`, `card`, `og`) and
      `adminThumbnail`. Existing files keep working; sizes are produced for new uploads.
    - Skills `color`, Services `iconFont` and the Footer icon selects keep their stored values, but are
      edited with a colour picker and an icon picker.
    - Image fields: the upload and the legacy URL stay as they are, grouped with a live preview of
      the image the site will use (upload first, then URL — the frontend's existing rule).
    - About and Header behave as single documents in the admin (one document; the list opens it).
      They stay collections, so the API and the frontend queries are unchanged.
    - Edit layouts use unnamed tabs, rows and the sidebar only, so the data shape is unchanged.
  - **Deferred (need frontend work or a data migration):** drafts/versions with scheduled publishing,
    live preview, `orderable` drag-and-drop ordering, converting About/Header to globals, the SEO
    plugin tab, and SiteSettings/Navigation globals consumed by the site.
- **Consequences:** `pnpm dev` pushes the new columns automatically. For a database that does not
  use push, create a migration (`pnpm payload migrate:create`) before deploying.
