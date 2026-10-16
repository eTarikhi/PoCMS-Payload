# ADR 0006 — Stay on Payload 3.9x, design for v4

- **Status:** Accepted (2026-10-16, decision D6)
- **Context:** Payload 4.0 is in beta (`4.0.0-beta.1`, 2026-10-13) with a redesigned admin, semantic
  tokens and no Sass. It requires Node ≥ 24.15.
- **Decision:** Build on Payload 3.90.x. Keep the work portable: tokens first, Payload class
  overrides in one file (`payload-overrides.css`), native extension points instead of replacing
  `Nav` or the dashboard view, Local API calls with `req` and `overrideAccess: false`.
- **Consequences:** Migrating to v4 means re-mapping tokens (§8.2.4 of the analysis), deleting
  `payload-overrides.css` and re-checking the list-view integration (ADR 0007). The checklist is in
  `docs/ui-modernization/admin-ui-guide.md`.
