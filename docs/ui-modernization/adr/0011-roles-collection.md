# ADR 0011 — Roles as documents: access levels per collection, tool capabilities

- **Status:** Accepted (2026-10-19). Supersedes ADR 0008.
- **Context:** ADR 0008 put a fixed `roles` select on users (`admin`, `editor`), with the rules in
  code. The owner asked for a page under Admin to manage roles, permissions and access levels,
  built the way Payload's documentation describes access control. Payload has no built-in roles
  screen: its access control is functions on collections, fields and globals that return a boolean
  or a query. So the roles must be data that those functions read.
- **Decision:**
  - A **`roles` collection** (Admin group, administrators only). A role has a name, a description,
    "Give to new users", **Full access (administrator)**, an **access level** per governed
    collection and global, and **capabilities** for the admin tools.
  - **Access levels** (radio fields, one per collection or global, generated from the config so a
    new collection gets its row automatically): No access, Read only, Edit (create, edit, move to
    the trash, restore), Full (also delete permanently). Globals have No access, Read only, Edit.
  - **Capabilities** (checkboxes): site traffic and page speed, deployments and CI, audit log,
    scheduled jobs, system information, developer tools (header menu, gallery), terminal.
  - **Governed** are all collections and globals except auth collections, Payload's internal
    `payload-*` collections and those with `custom: { permissions: false }` (roles and tool data,
    which use capabilities). Users and roles are managed by administrators only, so no role can
    grant itself more.
  - **Users** get `roles` (relationship, hasMany, field access: administrators only). A virtual
    `permissions` field (JSON, `afterRead` hook) merges the user's roles on every read: highest
    level per collection, union of capabilities. `req.user.permissions` and
    `useAuth().user.permissions` therefore always reflect the current roles, access functions stay
    synchronous, and it works for REST, GraphQL (where the user is loaded at depth 0) and the Local
    API alike. Roles are loaded once per request (`req.context`).
  - Collection access follows Payload's docs: content collections keep public `read` (the site);
    `create`/`update` need Edit; `delete` needs Full, or Edit when Payload trashes (it passes
    `data.deletedAt`). `admin.hidden` is a function of the user, so a collection without read
    access leaves the sidebar and the admin routes. `access.admin` on users requires at least one
    role.
  - **Built in:** the Administrator role (`system`, full access, cannot be deleted or lose full
    access) and, on a fresh install, an Editor role (Edit everywhere, traffic and deployment
    widgets, given to new users). The first user becomes an administrator. Hooks refuse to remove
    or delete the last administrator.
  - **Migration (additive, ADR 0005):** the old select stays as the hidden `legacyRoles` field on
    its old table (`dbName: 'users_roles'`, `enumName: 'enum_users_roles'`), so no data is dropped.
    `ensureRoles` (on init) moves each user once (admin → Administrator, editor → the default
    roles) and clears the old value. A later migration can drop the column.
- **Consequences:**
  - New tables `roles` and `users_rels`; development pushes them, production needs a migration
    (`npx payload migrate:create`, `npx payload migrate`).
  - The roles list shows an **access overview** (`beforeListTable`): collections and tools down,
    roles across, computed with the same merge the access checks use.
  - Code checks `can(user, slug, operation)`, `hasCapability(user, capability)` and `isAdmin(user)`
    from `src/access/permissions.ts` (safe in client components); access factories and hooks are in
    `src/access/roles.ts`. Tests: `tests/int/roles.int.spec.ts`, `tests/e2e/roles.e2e.spec.ts`.
