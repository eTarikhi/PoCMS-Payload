import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  backupFilename,
  backupSettings,
  DEFAULT_BACKUP_DIR,
  DEFAULT_BACKUP_KEEP,
  formatBytes,
  isBackupName,
  listBackups,
  MAX_BACKUP_BYTES,
  pruneBackups,
  prunePlan,
  safeBackupPath,
  takenAtOf,
  writeBackup,
  type BackupFile,
} from '@/plugins/databaseTools/server/backups'

/**
 * Where the scheduled backups go, and what is safe to serve back out of them.
 *
 * Two things here can destroy data if they are wrong. Retention deletes files, so the decision is a
 * pure function over a list and the newest always survive whatever their names look like. The
 * download endpoint takes a filename from a query string, so the guard is a resolved path inside the
 * backup directory and not a string search — `..%2f`, a leading slash and a symlink are the three
 * ways a string search loses.
 */

const file = (name: string, takenAt: string, bytes = 1024): BackupFile => ({
  name,
  bytes,
  modifiedAt: takenAt,
  format: name.endsWith('.json') ? 'json' : 'sql',
  takenAt,
})

describe('naming a backup', () => {
  it('writes a name that sorts chronologically and survives a filesystem and a URL', () => {
    const at = new Date('2026-10-23T04:05:06.789Z')
    const name = backupFilename({ database: 'pocms', format: 'sql', at })
    expect(name).toBe('pocms-pocms-2026-10-23_04-05-06.sql')
    // No colon (illegal on Windows, awkward in a query string) and no millisecond noise.
    expect(name).not.toContain(':')
    expect(name.slice(0, -4)).not.toContain('.')
  })

  it('takes the format’s extension and tidies a database name that is not a filename', () => {
    const at = new Date('2026-10-23T04:05:06.789Z')
    expect(backupFilename({ database: 'app', format: 'json', at })).toMatch(/\.json$/)
    expect(backupFilename({ database: '../etc/passwd', format: 'sql', at })).toBe(
      'pocms-___etc_passwd-2026-10-23_04-05-06.sql',
    )
    expect(backupFilename({ database: '', format: 'sql', at })).toContain('pocms-database-')
  })

  it('reads its own timestamp back, and refuses a name that has none', () => {
    const at = new Date('2026-10-23T04:05:06.000Z')
    const name = backupFilename({ database: 'pocms', format: 'sql', at })
    expect(takenAtOf(name)).toBe('2026-10-23T04:05:06.000Z')
    expect(takenAtOf('something-else.sql')).toBeNull()
    expect(takenAtOf('pocms-2026-99-99_04-05-06.sql')).toBeNull()
  })

  it('accepts only the two extensions it writes', () => {
    expect(isBackupName('pocms-app-2026-10-23_04-05-06.sql')).toBe(true)
    expect(isBackupName('pocms-app-2026-10-23_04-05-06.json')).toBe(true)
    expect(isBackupName('.hidden.sql')).toBe(false)
    expect(isBackupName('../.env')).toBe(false)
    expect(isBackupName('dump.sql.gz')).toBe(false)
    expect(isBackupName('notes.txt')).toBe(false)
    expect(isBackupName('')).toBe(false)
  })
})

describe('what the environment asks for', () => {
  const previous = { ...process.env }

  afterAll(() => {
    process.env = { ...previous }
  })

  it('defaults to .backups/, seven files and a SQL dump', () => {
    delete process.env.BACKUP_DIR
    delete process.env.BACKUP_KEEP
    delete process.env.BACKUP_FORMAT
    const settings = backupSettings()
    expect(settings.dir).toBe(DEFAULT_BACKUP_DIR)
    expect(DEFAULT_BACKUP_KEEP).toBe(7)
    expect(settings.keep).toBe(7)
    expect(settings.format).toBe('sql')
    expect(path.isAbsolute(settings.resolved)).toBe(true)
    expect(settings.note).toMatch(/db:restore/)
  })

  it('reads BACKUP_DIR, BACKUP_KEEP and BACKUP_FORMAT, and ignores nonsense', () => {
    process.env.BACKUP_DIR = ' var/backups '
    process.env.BACKUP_KEEP = '3'
    process.env.BACKUP_FORMAT = 'JSON'
    const settings = backupSettings()
    expect(settings.dir).toBe('var/backups')
    expect(settings.keep).toBe(3)
    expect(settings.format).toBe('json')

    // `Number(null)` is 0 and `Number('abc')` is NaN: neither may become a retention of zero.
    process.env.BACKUP_KEEP = 'abc'
    expect(backupSettings().keep).toBe(DEFAULT_BACKUP_KEEP)
    process.env.BACKUP_KEEP = '0'
    expect(backupSettings().keep).toBe(DEFAULT_BACKUP_KEEP)
    process.env.BACKUP_KEEP = '-5'
    expect(backupSettings().keep).toBe(DEFAULT_BACKUP_KEEP)
    process.env.BACKUP_KEEP = '2.9'
    expect(backupSettings().keep).toBe(2)
  })

  it('says so when the filesystem it writes to will not outlive the request', () => {
    process.env.BACKUP_DIR = '.backups'
    process.env.POSTGRES_URL = 'postgres://u:p@ep-a-pooler.eu-central-1.aws.neon.tech/app'
    const settings = backupSettings()
    expect(settings.ephemeralFilesystem).toBe(true)
    expect(settings.note).toMatch(/Neon backup branch/)

    process.env.POSTGRES_URL = 'postgres://postgres:postgres@127.0.0.1:5432/pocms'
    expect(backupSettings().ephemeralFilesystem).toBe(false)
  })
})

describe('deciding what to prune, without touching a disk', () => {
  const files = [
    file('pocms-app-2026-10-20_04-00-00.sql', '2026-10-20T04:00:00.000Z'),
    file('pocms-app-2026-10-23_04-00-00.sql', '2026-10-23T04:00:00.000Z'),
    file('pocms-app-2026-10-21_04-00-00.sql', '2026-10-21T04:00:00.000Z'),
    file('pocms-app-2026-10-22_04-00-00.sql', '2026-10-22T04:00:00.000Z'),
  ]

  it('keeps the newest N by the stamp in the name, not by the order the directory gave', () => {
    const plan = prunePlan(files, 2)
    expect(plan.keep.map((entry) => entry.name)).toEqual([
      'pocms-app-2026-10-23_04-00-00.sql',
      'pocms-app-2026-10-22_04-00-00.sql',
    ])
    expect(plan.remove.map((entry) => entry.name)).toEqual([
      'pocms-app-2026-10-21_04-00-00.sql',
      'pocms-app-2026-10-20_04-00-00.sql',
    ])
  })

  it('never deletes everything, however the retention is written', () => {
    expect(prunePlan(files, 0).keep).toHaveLength(1)
    expect(prunePlan(files, -3).keep).toHaveLength(1)
    // `Math.floor(NaN)` is NaN, and `slice(0, NaN)` is empty: an unvalidated retention would have
    // deleted every file and reported that it kept none.
    expect(prunePlan(files, Number.NaN).keep).toHaveLength(1)
    expect(prunePlan(files, Number.POSITIVE_INFINITY).keep).toHaveLength(4)
    expect(prunePlan(files, 0).remove).toHaveLength(3)
    // …and a retention above the number of files deletes nothing.
    expect(prunePlan(files, 99).remove).toEqual([])
    expect(prunePlan([], 7)).toEqual({ keep: [], remove: [] })
  })

  it('does not reorder the list it was given', () => {
    const original = [...files]
    prunePlan(files, 2)
    expect(files).toEqual(original)
  })
})

describe('the directory itself', () => {
  let dir: string
  const previous = { ...process.env }

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pocms-backups-'))
    process.env.BACKUP_DIR = dir
    process.env.BACKUP_KEEP = '2'
    process.env.BACKUP_FORMAT = 'sql'
  })

  afterAll(async () => {
    process.env = { ...previous }
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('lists a directory that does not exist yet as empty, not as an error', async () => {
    const settings = backupSettings()
    expect(await listBackups({ ...settings, resolved: path.join(dir, 'nope') })).toEqual([])
  })

  it('writes a dump, lists it newest first, and prunes what the plan named', async () => {
    const settings = backupSettings()
    await fs.mkdir(dir, { recursive: true })

    const first = backupFilename({ database: 'app', format: 'sql', at: new Date('2026-10-21T04:00:00Z') })
    const second = backupFilename({ database: 'app', format: 'sql', at: new Date('2026-10-22T04:00:00Z') })
    const third = backupFilename({ database: 'app', format: 'sql', at: new Date('2026-10-23T04:00:00Z') })

    for (const name of [first, second, third]) {
      const written = await writeBackup(settings, { name, content: `-- ${name}\nCREATE TABLE "x" ();\n` })
      expect(written.bytes).toBeGreaterThan(0)
      expect(written.path.startsWith(dir)).toBe(true)
    }

    const listed = await listBackups(settings)
    expect(listed.map((entry) => entry.name)).toEqual([third, second, first])
    expect(listed[0]?.format).toBe('sql')
    expect(listed[0]?.takenAt).toBe('2026-10-23T04:00:00.000Z')

    const plan = prunePlan(listed, settings.keep)
    const pruned = await pruneBackups(settings, plan.remove)
    expect(pruned.removed).toEqual([first])
    expect(pruned.failed).toEqual([])
    expect((await listBackups(settings)).map((entry) => entry.name)).toEqual([third, second])
  })

  it('ignores a file that is not a backup, and reports one it cannot delete', async () => {
    const settings = backupSettings()
    await fs.writeFile(path.join(dir, 'notes.txt'), 'not a backup', 'utf8')
    await fs.writeFile(path.join(dir, '.hidden.sql'), 'not a backup', 'utf8')
    const listed = await listBackups(settings)
    expect(listed.every((entry) => entry.name.endsWith('.sql') || entry.name.endsWith('.json'))).toBe(true)
    expect(listed.some((entry) => entry.name === 'notes.txt')).toBe(false)

    // A plan naming a file that is not there: reported as failed, not thrown.
    const result = await pruneBackups(settings, [file('gone-2026-01-01_00-00-00.sql', '2026-01-01T00:00:00.000Z')])
    expect(result.removed).toEqual([])
    expect(result.failed).toEqual(['gone-2026-01-01_00-00-00.sql'])

    await fs.rm(path.join(dir, 'notes.txt'), { force: true })
    await fs.rm(path.join(dir, '.hidden.sql'), { force: true })
  })

  it('refuses a name that would leave the backup directory', () => {
    const settings = backupSettings()
    expect(safeBackupPath(settings, '../../.env')).toBeNull()
    expect(safeBackupPath(settings, '../.env')).toBeNull()
    expect(safeBackupPath(settings, '/etc/passwd')).toBeNull()
    expect(safeBackupPath(settings, 'sub/dir/dump.sql')).toBeNull()
    expect(safeBackupPath(settings, 'dump.sql.gz')).toBeNull()
    expect(safeBackupPath(settings, '')).toBeNull()
    // A plain name inside the directory is fine.
    expect(safeBackupPath(settings, 'pocms-app-2026-10-23_04-00-00.sql')).toBe(
      path.join(settings.resolved, 'pocms-app-2026-10-23_04-00-00.sql'),
    )
  })

  it('refuses to write a name that is not one of its own, or a dump larger than the cap', async () => {
    const settings = backupSettings()
    await expect(writeBackup(settings, { name: '../../escape.sql', content: 'x' })).rejects.toThrow(
      /not a backup filename/,
    )
    expect(MAX_BACKUP_BYTES).toBe(512 * 1024 * 1024)
  })
})

describe('the units a card prints', () => {
  it('formats bytes without inventing precision', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 kB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })
})
