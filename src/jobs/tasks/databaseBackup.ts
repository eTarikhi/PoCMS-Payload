import { databaseTarget, withDatabase } from '@/plugins/databaseTools/server/connection'
import { buildSqlBackup, buildJsonBackup } from '@/plugins/databaseTools/server/backup'
import {
  backupFilename,
  backupSettings,
  formatBytes,
  listBackups,
  pruneBackups,
  prunePlan,
  writeBackup,
} from '@/plugins/databaseTools/server/backups'

import type { JobTask } from '../types'

/**
 * A nightly dump of the whole database, with retention.
 *
 * The Backup card on `/admin/database` writes the same file on demand; this is the version nobody has
 * to remember to click. It runs through the same jobs queue as the rest of the maintenance work, so
 * every attempt is a document in `job-runs` with its summary and log — which is what makes "did the
 * backup run last night?" a question with an answer.
 *
 * What it writes is `buildSqlBackup`'s dump: the enum types, tables, keys, indexes and rows, in the
 * order that restores into an empty database. That means it restores through either door that
 * already exists — the Restore card, or `pnpm db:restore <file> --yes` — and needs no tool of its
 * own. `BACKUP_FORMAT=json` writes the structured dump instead, which is the one the schema
 * comparison reads.
 *
 * Retention is decided by `prunePlan`, a pure function over the file list, and carried out only on
 * the names it returns, only inside the backup directory, only for files that look like backups. The
 * newest `BACKUP_KEEP` (default 7) always survive, whatever their names are.
 *
 * What it cannot do is outlive a serverless filesystem. On Vercel the directory is scratch space:
 * the file is written, the invocation ends, and it is gone. Rather than pretend otherwise, the run
 * detects that case (`isServerless`, from the database host) and says in its own summary what to use
 * instead — a Neon backup branch, which is point-in-time restorable and has a button on the same
 * page. A dump on a real disk and a branch on Neon are the two honest answers; a dump on scratch
 * space is neither.
 */

/** A dump over this many tables is truncated per table rather than run until the invocation ends. */
export const MAX_ROWS_PER_TABLE = 100_000

export const databaseBackup: JobTask = {
  slug: 'database-backup',
  label: 'Database backup',
  description:
    'Writes a full SQL dump to the backup directory and prunes it to the newest few. On a serverless filesystem it says so and points at a Neon backup branch instead.',
  schedule: 'daily',
  needs: [],
  estimate: 'under a minute',
  async run({ log }) {
    const settings = backupSettings()
    const target = databaseTarget()
    log(`Backing up ${target.database || 'the database'} on ${target.host || 'an unknown host'}.`)
    log(
      `Writing to ${settings.dir}/ (resolved ${settings.resolved}), keeping the newest ${settings.keep}, format ${settings.format}.`,
    )
    if (settings.ephemeralFilesystem) {
      log(
        'This process runs against a serverless database: the filesystem does not outlive the request, so treat this file as a log line rather than a backup.',
      )
    }

    const built = await withDatabase(async (client) => {
      const options = { maxRowsPerTable: MAX_ROWS_PER_TABLE }
      if (settings.format === 'json') {
        const json = await buildJsonBackup(client, options)
        const parsed = JSON.parse(json.json) as {
          tables?: { name: string; rows?: unknown[] }[]
        }
        return {
          name: json.filename,
          content: json.json,
          tables: parsed.tables?.length ?? 0,
          rows: (parsed.tables ?? []).reduce((sum, table) => sum + (table.rows?.length ?? 0), 0),
        }
      }
      const dump = await buildSqlBackup(client, options)
      return {
        name: dump.filename,
        content: dump.sql,
        tables: dump.tables.length,
        rows: dump.rows,
      }
    })

    // The builder's own filename carries the date but not the time, and a nightly job that runs
    // twice in a day must not overwrite the first one.
    const name = backupFilename({
      database: target.database,
      format: settings.format,
    })
    const written = await writeBackup(settings, { name, content: built.content })
    log(
      `Wrote ${name}: ${formatBytes(written.bytes)}` +
        (built.tables > 0 ? `, ${built.tables} table(s), ${built.rows} row(s).` : '.'),
    )

    const existing = await listBackups(settings)
    const plan = prunePlan(existing, settings.keep)
    let removed: string[] = []
    if (plan.remove.length > 0) {
      const pruned = await pruneBackups(settings, plan.remove)
      removed = pruned.removed
      log(
        pruned.removed.length > 0
          ? `Pruned ${pruned.removed.length} older backup(s): ${pruned.removed.join(', ')}.`
          : 'Nothing to prune.',
      )
      if (pruned.failed.length > 0) {
        log(`Could not delete: ${pruned.failed.join(', ')}.`)
      }
    } else {
      log(`${existing.length} backup(s) on disk, within the retention of ${settings.keep}.`)
    }

    const summary =
      `Wrote ${name} (${formatBytes(written.bytes)})` +
      (built.tables > 0 ? ` — ${built.tables} tables, ${built.rows} rows` : '') +
      (removed.length > 0 ? `; pruned ${removed.length}` : '') +
      (settings.ephemeralFilesystem
        ? '. This filesystem is ephemeral: take a Neon backup branch for a backup that survives.'
        : `; ${plan.keep.length} kept in ${settings.dir}/.`)

    return {
      summary,
      details: {
        file: name,
        bytes: written.bytes,
        path: written.path,
        tables: built.tables,
        rows: built.rows,
        format: settings.format,
        directory: settings.dir,
        kept: plan.keep.map((file) => file.name),
        removed,
        ephemeralFilesystem: settings.ephemeralFilesystem,
      },
    }
  },
}
