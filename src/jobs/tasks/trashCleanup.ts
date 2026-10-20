import type { JobTask } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Empties the trash: permanently deletes documents that were moved to the trash more than
 * TRASH_RETENTION_DAYS days ago (30 by default), on every collection that has `trash: true`.
 *
 * Payload's `delete` with `trash: true` deletes for good, which is what emptying the trash means;
 * editors can restore anything younger than the retention window. Media documents take their file
 * with them. Collections are reported one by one so the log shows where the deletions happened.
 */
export const trashCleanup: JobTask = {
  slug: 'trash-cleanup',
  label: 'Empty the trash',
  description:
    'Permanently deletes documents that have been in the trash longer than the retention window (30 days, TRASH_RETENTION_DAYS).',
  schedule: 'daily',
  estimate: 'under 5 s',
  async run({ payload, log }) {
    const retentionDays = Math.max(1, Number(process.env.TRASH_RETENTION_DAYS) || 30)
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS).toISOString()
    const collections = payload.config.collections.filter((collection) => collection.trash)
    log(`Cut-off ${cutoff} (${retentionDays} days); ${collections.length} collections have trash.`)

    const perCollection: Record<string, number> = {}
    let removed = 0
    for (const collection of collections) {
      let count = 0
      // Re-query after each page: deleting changes the result set.
      for (;;) {
        const { docs } = await payload.find({
          collection: collection.slug,
          trash: true,
          where: { deletedAt: { less_than: cutoff } },
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
        if (docs.length === 0) break
        for (const doc of docs) {
          await payload.delete({
            collection: collection.slug,
            id: doc.id,
            trash: true,
            overrideAccess: true,
          })
          count++
          removed++
        }
        log(`${collection.slug}: ${count} deleted so far`)
      }
      if (count > 0) perCollection[collection.slug] = count
    }

    const summary =
      removed === 0
        ? `Nothing to delete: no documents in the trash older than ${retentionDays} days.`
        : `Deleted ${removed} document${removed === 1 ? '' : 's'} from the trash (older than ${retentionDays} days).`
    log(summary)
    return { summary, details: { retentionDays, cutoff, removed, perCollection } }
  },
}
