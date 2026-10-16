# ADR 0008 — Roles on Users (`admin`, `editor`)

- **Status:** Accepted (2026-10-16, decision D8)
- **Context:** Every logged-in user can currently do everything, including managing other users.
  Role-aware dashboards and navigation need a role.
- **Decision:**
  - `users.roles`: `select`, `hasMany`, options `admin` and `editor`, default `['editor']`,
    `saveToJWT: true`, required.
  - Field-level access: only admins can set or change roles, so nobody can promote themselves.
  - Collection access: admins manage users; an editor can read and update only their own account.
    Content collections are unchanged (any logged-in user can edit content; reads stay public).
  - The admin-only UI kit and the "Administration" group are hidden from editors.
  - **No lock-out:** the first user created through the admin always becomes `admin`, and on start-up
    `onInit` promotes the oldest user to `admin` if no admin exists (for example right after the
    column is added to an existing database).
- **Consequences:** Existing users keep access. Promote further admins in Users → Roles.
