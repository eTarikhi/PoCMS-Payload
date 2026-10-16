# Content localization operations

## Enabled locales

| Locale | Role                       | Direction | Fallback |
| ------ | -------------------------- | --------- | -------- |
| `en`   | Default/source locale      | LTR       | —        |
| `fa`   | Persian translation locale | RTL       | `en`     |

Payload localization is used for editorial content. It is deliberately separate from the Payload Admin UI language and frontend interface-message translation.

## Public frontend

English is the unprefixed public locale; Persian is served from the `/fa` prefix:

- Home pages: `/` and `/fa`
- Article pages: `/articles/[slug]` and `/fa/articles/[slug]`

The Persian subtree uses `lang="fa"` and `dir="rtl"`. The language link preserves the current internal path, so it takes an article reader to the matching locale URL. Public metadata uses a locale-specific canonical URL plus English, Persian, and `x-default` hreflang alternates.

Static frontend text belongs in `src/i18n/messages.ts`; it must not be entered as editorial content. Editorial strings continue to come from Payload and are read using the active content locale. Persian reads may fall back to English while a translation is incomplete; English reads never fall back to Persian.

## Existing-content migration

`src/migrations/20261016_171500_localize_english_content.ts` preserves pre-localization portfolio content by copying every selected single-language value into the `en` locale before removing the old columns. It covers localized text in the content collections, footer global, repeatable text rows, and media alternative text.

The Vercel Postgres adapter is configured with `push: false`, so a development boot cannot automatically push schema changes. This safeguard does not replace the migration or a verified backup.

Use this rollout order for an existing database:

1. Take and verify a database backup.
2. Deploy the migration-capable build to a maintenance/staging environment that points to a restored database copy.
3. Run the Payload migration with the production `PAYLOAD_SECRET` and `POSTGRES_URL` configured.
4. Verify that every required localized field resolves in `en`, including content lists, the footer, header text rows, and image alternative text.
5. Verify Persian fallback and completed translations on `/fa` before exposing the locale publicly.
6. Deploy to production only after the migration verification passes.

The migration is registered as a production migration in `src/payload.config.ts`. Its `down` operation restores English values only; Persian-only values created after migration cannot be represented by the prior single-language schema and are discarded by rollback.

## Translation workflow

- Create and maintain source content in `en`.
- Select `fa` in Payload before entering a Persian translation.
- Keep URLs, ordering, identifiers, contact links, media files, and other operational fields shared unless a future product requirement explicitly changes that policy.
- Treat fallback as an editorial aid, not proof that a Persian translation is complete.
- Translate accessible text such as media alternative text and social-link labels together with visible content.
