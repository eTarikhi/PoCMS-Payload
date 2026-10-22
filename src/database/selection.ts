/**
 * The `?tables=a,b,c` filter a backup request may carry.
 *
 * The backup code never trusts a name: it intersects the list with the tables the catalogs report,
 * so a name that is not a table simply disappears. This only rejects what cannot be a table at all,
 * so a typo is reported instead of silently producing an empty backup.
 */

const NAME = /^[a-zA-Z0-9_-]{1,63}$/
const MAX_TABLES = 200

export type TableSelection = { ok: true; tables?: string[] } | { ok: false; error: string }

export const validateTableSelection = (raw: string | null | undefined): TableSelection => {
  if (!raw || raw.trim().length === 0) return { ok: true }
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
  if (names.length === 0) return { ok: true }
  if (names.length > MAX_TABLES) return { ok: false, error: `Choose at most ${MAX_TABLES} tables.` }
  const invalid = names.filter((name) => !NAME.test(name))
  if (invalid.length > 0) {
    return { ok: false, error: `Not a table name: ${invalid.slice(0, 5).join(', ')}.` }
  }
  return { ok: true, tables: [...new Set(names)] }
}
