import fs from 'node:fs/promises'
import path from 'node:path'

import { isServerless } from './connection'

/**
 * Scheduled backups: where they go, what is kept, and what is safe to serve back.
 *
 * A backup is only a backup if it survives the thing it backs up, so the first question is *where*.
 * This module writes to the filesystem, which is the honest answer for a server that owns its disk
 * (a VPS, a container with a volume, a development machine) and the wrong answer for a serverless
 * function, whose filesystem is scratch space that disappears when the invocation does. Both cases
 * are detected and said out loud: on a serverless target the job still writes the file — a deploy
 * that happens to run on a warm instance leaves it there, and the log line is useful — but the
 * summary names what to use instead, which on Neon is a backup branch (the Neon card's own action,
 * and the one that is point-in-time restorable rather than a dump).
 *
 * What is written is the same `buildSqlBackup` dump the Backup card downloads, so it restores
 * through the same two doors: the Restore card, or `pnpm db:restore <file> --yes`.
 *
 * Retention is a pure function over a file list. Pruning is the part of a backup job that destroys
 * data, so it is decided by `prunePlan` — which can be tested without touching a disk — and carried
 * out only on the names that plan returns, inside the backup directory, for files that look like
 * backups. A cron job with `fs.unlink` and a glob is how a repository loses something it was not
 * asked to delete.
 */

export const DEFAULT_BACKUP_DIR = '.backups'
export const DEFAULT_BACKUP_KEEP = 7
/** Above this many bytes a dump is not written: a runaway table should not fill the disk. */
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024

export type BackupFormat = 'sql' | 'json'

export type BackupFile = {
  name: string
  bytes: number
  modifiedAt: string
  format: BackupFormat
  /** The timestamp in the filename, when it has one (`pocms-2026-10-23T04-00-00.sql`). */
  takenAt: string | null
}

export type BackupSettings = {
  dir: string
  /** Absolute path of `dir`. */
  resolved: string
  keep: number
  format: BackupFormat
  /** True when the process runs where the filesystem does not outlive the request. */
  ephemeralFilesystem: boolean
  /** One sentence saying what that means for these backups. */
  note: string
}

const EXTENSIONS: Record<BackupFormat, string> = { sql: '.sql', json: '.json' }

/** A name this module wrote: `pocms-<database>-<timestamp>.<ext>`. */
export const backupFilename = ({
  database,
  format,
  at = new Date(),
}: {
  database: string
  format: BackupFormat
  at?: Date
}): string => {
  // A colon is not legal in a Windows filename and reads badly in a URL; the stamp keeps its order.
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const safe = database.replace(/[^A-Za-z0-9_-]/g, '_') || 'database'
  return `pocms-${safe}-${stamp}${EXTENSIONS[format]}`
}

/** The timestamp a filename carries, or null when it does not look like one of ours. */
export const takenAtOf = (name: string): string | null => {
  const match = /(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/.exec(name)
  if (!match) return null
  const iso = (match[1] as string).replace('_', 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2')
  const date = new Date(`${iso}Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

/** What the environment asks for, with the defaults this project documents. */
export const backupSettings = (): BackupSettings => {
  const dir = process.env.BACKUP_DIR?.trim() || DEFAULT_BACKUP_DIR
  const format: BackupFormat = process.env.BACKUP_FORMAT?.trim().toLowerCase() === 'json' ? 'json' : 'sql'
  const keep = positiveInt(process.env.BACKUP_KEEP, DEFAULT_BACKUP_KEEP)
  const ephemeralFilesystem = isServerless()

  return {
    dir,
    resolved: path.resolve(process.cwd(), dir),
    keep,
    format,
    ephemeralFilesystem,
    note: ephemeralFilesystem
      ? 'This process runs against a serverless database, so the filesystem it writes to does not outlive the request. Take a Neon backup branch instead: it is point-in-time restorable, and the Database page has the button.'
      : `Dumps are written to ${dir}/ and the newest ${keep} are kept. Restore one from the Restore card on this page, or with \`pnpm db:restore <file> --yes\`.`,
  }
}

/** Is this a name a backup listing may show? Only the two extensions this module writes. */
export const isBackupName = (name: string): boolean =>
  /^[A-Za-z0-9._-]+\.(sql|json)$/.test(name) && !name.startsWith('.')

/**
 * The path a name refers to inside the backup directory, or null when it does not belong there.
 *
 * A download endpoint that takes a filename from a query string is one `../` away from reading
 * `../../.env`, so the check is the resolved path starting with the resolved directory — not a
 * string search, which `..%2f` and a symlink both defeat.
 */
export const safeBackupPath = (settings: BackupSettings, name: string): string | null => {
  if (!isBackupName(name)) return null
  const resolved = path.resolve(settings.resolved, name)
  if (resolved !== settings.resolved && !resolved.startsWith(`${settings.resolved}${path.sep}`)) {
    return null
  }
  return resolved
}

/** The backups on disk, newest first. A directory that does not exist yet is an empty list. */
export const listBackups = async (settings: BackupSettings): Promise<BackupFile[]> => {
  let entries: string[]
  try {
    entries = await fs.readdir(settings.resolved)
  } catch {
    return []
  }

  const files: BackupFile[] = []
  for (const entry of entries) {
    if (!isBackupName(entry)) continue
    try {
      const stats = await fs.stat(path.join(settings.resolved, entry))
      if (!stats.isFile()) continue
      const format: BackupFormat = entry.endsWith('.json') ? 'json' : 'sql'
      files.push({
        name: entry,
        bytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        format,
        takenAt: takenAtOf(entry) ?? stats.mtime.toISOString(),
      })
    } catch {
      // A file being written right now, or one just pruned: not worth failing the list over.
    }
  }

  // Newest first by the stamp in the name, falling back to mtime for a file renamed by hand.
  return files.sort(
    (a, b) =>
      new Date(b.takenAt ?? b.modifiedAt).getTime() - new Date(a.takenAt ?? a.modifiedAt).getTime(),
  )
}

/**
 * Which files to keep and which to delete, given a retention count.
 *
 * Pure, and the newest are always kept whatever their names look like: a retention rule that can
 * delete every backup is worse than no retention rule. Anything below 1 — and anything that is not a
 * number at all — is treated as 1, because `Math.floor(NaN)` is `NaN`, `slice(0, NaN)` is empty and
 * `slice(NaN)` is the whole list: an unvalidated retention would delete every file and report that
 * it kept none. An infinite retention keeps everything, which is what "no limit" means.
 */
export const prunePlan = (files: BackupFile[], keep: number): { keep: BackupFile[]; remove: BackupFile[] } => {
  // An infinite retention means "keep everything"; anything not a number at all means "keep one",
  // because a retention that cannot be read must not become a retention of zero.
  const wanted = Number.isNaN(keep)
    ? 1
    : keep === Number.POSITIVE_INFINITY
      ? files.length
      : Math.max(1, Math.floor(keep))
  const ordered = [...files].sort(
    (a, b) =>
      new Date(b.takenAt ?? b.modifiedAt).getTime() - new Date(a.takenAt ?? a.modifiedAt).getTime(),
  )
  return { keep: ordered.slice(0, wanted), remove: ordered.slice(wanted) }
}

/** Write a dump into the backup directory, creating it if this is the first one. */
export const writeBackup = async (
  settings: BackupSettings,
  file: { name: string; content: string },
): Promise<{ path: string; bytes: number }> => {
  const target = safeBackupPath(settings, file.name)
  if (!target) {
    throw new Error(`"${file.name}" is not a backup filename this module writes.`)
  }
  if (Buffer.byteLength(file.content, 'utf8') > MAX_BACKUP_BYTES) {
    throw new Error(
      `The dump is larger than ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB and was not written.`,
    )
  }
  await fs.mkdir(settings.resolved, { recursive: true })
  await fs.writeFile(target, file.content, 'utf8')
  const stats = await fs.stat(target)
  return { path: target, bytes: stats.size }
}

/**
 * Delete the files a prune plan named, one at a time, and say which went.
 *
 * Every name is re-checked against the backup directory before it is unlinked, because the list a
 * plan was made from and the moment it is carried out are not the same instant.
 */
export const pruneBackups = async (
  settings: BackupSettings,
  remove: BackupFile[],
): Promise<{ removed: string[]; failed: string[] }> => {
  const removed: string[] = []
  const failed: string[] = []
  for (const file of remove) {
    const target = safeBackupPath(settings, file.name)
    if (!target) {
      failed.push(file.name)
      continue
    }
    try {
      await fs.unlink(target)
      removed.push(file.name)
    } catch {
      failed.push(file.name)
    }
  }
  return { removed, failed }
}

/** Bytes, in the units a card reads. */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const scaled = bytes / 1024 ** exponent
  return `${scaled >= 100 || exponent === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[exponent]}`
}
