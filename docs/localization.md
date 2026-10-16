# Content localization operations

## Enabled locales

| Locale | Role                       | Direction | Fallback |
| ------ | -------------------------- | --------- | -------- |
| `en`   | Default/source locale      | LTR       | —        |
| `fa`   | Persian translation locale | RTL       | `en`     |

Payload localization is used for editorial content. It is deliberately separate from the Payload Admin UI language and from frontend interface-message translation.

## Existing-content migration

`src/migrations/20261016_171500_localize_english_content.ts` preserves pre-localization portfolio content by copying every selected single-language value into the `en` locale before removing the old columns. It covers localized text in the content collections, footer global, repeatable text rows, and media alternative text.

> **Do not start a development server against an existing production clone before the migration runs.** Payload's development schema push may apply the schema shape without the value-copy operation.

Use this rollout order for an existing database:

1. Take and verify a database backup.
2. Deploy the migration-capable build to a maintenance/staging environment that points to a restored database copy.
3. Run the Payload migration with the production `PAYLOAD_SECRET` and `POSTGRES_URL` configured.
4. Verify that every required localized field resolves in `en`, including content lists, the footer, header text rows, and image alternative text.
5. Verify that no Persian locale contains unreviewed fallback-dependent content before exposing `/fa` publicly.
6. Deploy to production only after the migration verification passes.

The migration is registered as a production migration in `src/payload.config.ts`. Its `down` operation restores English values only; Persian-only values created after migration cannot be represented by the prior single-language schema and are discarded by rollback.

## Translation workflow

- Create and maintain source content in `en`.
- Select `fa` in Payload before entering a Persian translation.
- Keep URLs, ordering, identifiers, contact links, media files, and other operational fields shared unless a future product requirement explicitly changes that policy.
- Treat fallback as an editorial aid, not proof that a Persian translation is complete.
- Translate accessible text such as media alternative text and social-link labels together with visible content.
