import { migrations } from '@/migrations'
import { withDatabase } from '@/plugins/databaseTools/server/connection'
import { listTables } from '@/plugins/databaseTools/server/introspection'
import { runMaintenance } from '@/plugins/databaseTools/server/maintenance'
import { applyRepair, runRepairChecks } from '@/plugins/databaseTools/server/repair'

import type { JobTask } from '../types'

/**
 * Weekly database upkeep, without opening the database page.
 *
 * Postgres maintains itself, but a serverless database that sleeps, restores from a branch or grows
 * faster than autovacuum's thresholds can fall behind: planner statistics go missing (every query
 * gets a bad plan) and sequences drift behind their rows (the next insert fails with a duplicate
 * key). Both are cheap to fix and both are fixed here:
 *
 *   - `ANALYZE` every table that has rows but no statistics yet, plus those with more than
 *     `DEAD_ROWS_THRESHOLD` dead rows in a table past `SMALL_TABLE` — the same measurement the page
 *     shows.
 *   - `setval` every sequence that is behind its table (the "ID sequences" repair).
 *
 * What it deliberately does *not* do is the destructive half: deleting orphaned relation rows and
 * `REINDEX`ing invalid indexes stay manual decisions on the page, where the admin sees what would
 * change first. The run still reports them, so a check that keeps failing shows up in the job log
 * instead of on a page nobody opens.
 *
 * Bounded so it fits in one serverless invocation: at most `MAX_TABLES` tables are touched, each
 * with one statement, and `VACUUM` without `FULL` never locks a table for writing.
 */

const MAX_TABLES = 20
const DEAD_ROWS_THRESHOLD = 1_000
const SMALL_TABLE = 1_000
/** A table bigger than this is left to autovacuum rather than vacuumed inside one request. */
const MAX_BYTES = 200 * 1024 * 1024
const formatMB = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`

export const databaseUpkeep: JobTask = {
  slug: 'database-upkeep',
  label: 'Database upkeep',
  description:
    'ANALYZEs tables without statistics (or with many dead rows) and moves ID sequences past their highest id. Reports orphaned rows and invalid indexes without touching them.',
  schedule: 'weekly',
  weekday: 7,
  estimate: 'under 20 s',
  async run({ log }) {
    const result = await withDatabase(async (client) => {
      const tables = await listTables(client)

      const needsAnalyze = tables
        .filter(
          (table) =>
            (table.rows > 0 && table.lastAnalyze === null) ||
            (table.deadRows >= DEAD_ROWS_THRESHOLD && table.rows >= SMALL_TABLE),
        )
        .sort((a, b) => b.rows - a.rows)
      const tooBig = needsAnalyze.filter((table) => table.bytes > MAX_BYTES)
      const targets = needsAnalyze
        .filter((table) => table.bytes <= MAX_BYTES)
        .slice(0, MAX_TABLES)

      log(
        `${tables.length} tables; ${needsAnalyze.length} need ANALYZE, ${targets.length} will be done now.`,
      )
      if (tooBig.length > 0) {
        log(`Left to autovacuum (over ${formatMB(MAX_BYTES)}): ${tooBig.map((t) => t.name).join(', ')}`)
      }

      let statements = 0
      for (const table of targets) {
        // VACUUM ANALYZE when there are dead rows to reclaim, plain ANALYZE otherwise: neither
        // takes an access-exclusive lock, and this runs inside the cron request.
        const action = table.deadRows >= DEAD_ROWS_THRESHOLD ? 'vacuum-analyze' : 'analyze'
        const outcome = await runMaintenance(client, action, table.name)
        statements += outcome.statements.length
        log(
          `${action} ${table.name}: ${outcome.statements.join(' ') || 'nothing to do'}` +
            (table.deadRows > 0 ? ` (${table.deadRows} dead rows before)` : ''),
        )
      }

      // Sequences behind their rows: the one fix that prevents a failed insert, and idempotent.
      const checks = await runRepairChecks(
        client,
        migrations.map((migration) => migration.name),
      )
      const pending = checks.checks.filter((check) => check.status !== 'ok')
      let repaired = 0
      if (pending.some((check) => check.id === 'sequences')) {
        const outcome = await applyRepair(client, 'sequences')
        repaired = outcome.fixed
        log(`Sequences: ${outcome.statements.join(' ')}`)
      }

      // Reported, never applied here: both need a decision.
      const manual = pending.filter(
        (check) => check.id === 'orphans' || check.id === 'indexes',
      )

      return { tables: tables.length, analyzed: targets.length, statements, repaired, manual, pending }
    })

    const sequences =
      result.repaired > 0
        ? `${result.repaired} sequence${result.repaired === 1 ? '' : 's'} moved past their rows`
        : 'sequences already ahead of their rows'
    const summary =
      (result.analyzed === 0 && result.repaired === 0
        ? `Nothing to do: ${result.tables} tables have statistics and every sequence is ahead of its rows`
        : result.analyzed === 0
          ? `Nothing to analyze; ${sequences}`
          : `${result.analyzed} of ${result.tables} tables analyzed, ${sequences}`) +
      (result.manual.length > 0
        ? `; ${result.manual.length} check(s) need a decision (${result.manual
            .map((check) => check.title)
            .join(', ')})`
        : '')

    return {
      summary,
      details: {
        tables: result.tables,
        analyzed: result.analyzed,
        statements: result.statements,
        sequencesRepaired: result.repaired,
        checks: result.pending.map((check) => ({
          id: check.id,
          status: check.status,
          summary: check.summary,
        })),
      },
    }
  },
}
