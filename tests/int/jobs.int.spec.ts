import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isDue, isoWeekday, TASKS } from '@/jobs/registry'
import { queueDueJobs, queueJob, runQueue } from '@/jobs/runner'
import { jobsCronEndpoint } from '@/endpoints/jobs'
import config from '@/payload.config'
import type { JobRun, Role, Skill, User } from '@/payload-types'

/**
 * Scheduled maintenance (CR-12 E4): the registry, the queue, the runner's records, the permanent
 * deletion of old trash and the cron endpoint's secret check.
 */
const DAY_MS = 24 * 60 * 60 * 1000

describe('JobRun registry', () => {
  it('registers every task with a unique slug and a schedule', () => {
    const slugs = TASKS.map((task) => task.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs).toEqual([
      'trash-cleanup',
      'pagespeed-report',
      'publish-scheduled',
      'broken-links',
      'database-upkeep',
      'database-backup',
    ])
    for (const task of TASKS) {
      expect(task.label.length).toBeGreaterThan(0)
      expect(task.description.length).toBeGreaterThan(0)
    }
  })

  it('runs daily tasks every day and weekly tasks on their weekday only', () => {
    const daily = TASKS.find((task) => task.slug === 'trash-cleanup')!
    const weekly = TASKS.find((task) => task.slug === 'broken-links')!
    const monday = new Date('2026-10-19T03:15:00Z')
    const tuesday = new Date('2026-10-20T03:15:00Z')
    expect(isoWeekday(monday)).toBe(1)
    expect(isoWeekday(new Date('2026-10-25T03:15:00Z'))).toBe(7)
    expect(isDue(daily, tuesday)).toBe(true)
    expect(isDue(weekly, monday)).toBe(true)
    expect(isDue(weekly, tuesday)).toBe(false)
  })
})

describe('Jobs', () => {
  let payload: Payload
  let administrator: Role
  let admin: User
  let editor: User
  let viewerRole: Role
  let viewer: User
  let skill: Skill
  const stamp = Date.now()
  const createdJobs: number[] = []

  const track = <T extends JobRun>(job: T): T => {
    createdJobs.push(job.id)
    return job
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    administrator = (
      await payload.find({ collection: 'roles', where: { system: { equals: true } }, limit: 1 })
    ).docs[0]
    admin = await payload.create({
      collection: 'users',
      data: {
        email: `jobs-admin-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [administrator.id],
      },
    })
    editor = await payload.create({
      collection: 'users',
      data: { email: `jobs-editor-${stamp}@example.test`, password: 'int-test-1' },
    })
    // No capabilities at all: the built-in Editor role includes traffic and deployments.
    viewerRole = await payload.create({
      collection: 'roles',
      data: { name: `Jobs viewer ${stamp}`, levels: { skills: 'read' } },
    })
    viewer = await payload.create({
      collection: 'users',
      data: {
        email: `jobs-viewer-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [viewerRole.id],
      },
    })
    skill = await payload.create({
      collection: 'skills',
      data: { label: `JobRun trash ${stamp}`, value: 10, group: 'frontend', color: 'primary' },
    })
  })

  afterAll(async () => {
    if (!payload) return
    if (createdJobs.length > 0)
      await payload.delete({ collection: 'job-runs', where: { id: { in: createdJobs } } })
    await payload.delete({
      collection: 'users',
      where: { email: { like: `-${stamp}@example.test` } },
    })
  })

  it('refuses an unknown task', async () => {
    expect(await queueJob(payload, { task: 'nope', trigger: 'manual' })).toEqual({
      status: 'unknown-task',
    })
  })

  it('refuses a task whose environment variables are missing', async () => {
    const saved = process.env.GOOGLE_API_KEY
    delete process.env.GOOGLE_API_KEY
    const outcome = await queueJob(payload, { task: 'pagespeed-report', trigger: 'manual' })
    expect(outcome.status).toBe('needs-env')
    if (outcome.status === 'needs-env') expect(outcome.missing).toContain('GOOGLE_API_KEY')
    if (saved) process.env.GOOGLE_API_KEY = saved
  })

  it('queues a task once and reports the active run as busy', async () => {
    const first = await queueJob(payload, { task: 'trash-cleanup', trigger: 'manual', user: admin })
    expect(first.status).toBe('queued')
    if (first.status !== 'queued') return
    track(first.job)
    expect(first.job).toMatchObject({ task: 'trash-cleanup', status: 'queued', trigger: 'manual' })

    const second = await queueJob(payload, {
      task: 'trash-cleanup',
      trigger: 'manual',
      user: admin,
    })
    expect(second.status).toBe('busy')
    if (second.status === 'busy') expect(second.job.id).toBe(first.job.id)

    // Drain, so the next tests start with an empty queue.
    const { ran } = await runQueue(payload, { only: 'trash-cleanup' })
    expect(ran.map((job) => job.id)).toContain(first.job.id)
  })

  it('skips a cancelled run and still drains the queue', async () => {
    const queued = await queueJob(payload, { task: 'trash-cleanup', trigger: 'manual' })
    if (queued.status !== 'queued') throw new Error('expected a queued run')
    track(queued.job)

    // Cancel it before its turn: the runner skips it instead of starting it.
    await payload.update({
      collection: 'job-runs',
      id: queued.job.id,
      data: { status: 'cancelled', finishedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    const drained = await runQueue(payload)
    expect(drained.ran.map((job) => job.id)).not.toContain(queued.job.id)
    const kept = await payload.findByID({
      collection: 'job-runs',
      id: queued.job.id,
      overrideAccess: true,
    })
    expect(kept.status).toBe('cancelled')

    // The queue is free again afterwards.
    const again = await queueJob(payload, { task: 'trash-cleanup', trigger: 'manual' })
    expect(again.status).toBe('queued')
    if (again.status !== 'queued') return
    track(again.job)
    const { ran } = await runQueue(payload, { only: 'trash-cleanup' })
    expect(ran.map((job) => job.id)).toContain(again.job.id)
  })

  it('runs database upkeep: analyzes, moves sequences and leaves decisions alone', async () => {
    const queued = await queueJob(payload, { task: 'database-upkeep', trigger: 'manual' })
    expect(queued.status).toBe('queued')
    if (queued.status !== 'queued') return
    track(queued.job)

    const { ran } = await runQueue(payload, { only: 'database-upkeep' })
    expect(ran.map((job) => job.id)).toContain(queued.job.id)

    const run = await payload.findByID({
      collection: 'job-runs',
      id: queued.job.id,
      overrideAccess: true,
    })
    expect(run.status).toBe('done')
    // Either it found work (tables analyzed / sequences moved) or said so plainly.
    expect(run.summary).toMatch(/tables analyzed|Nothing to (do|analyze)/)
    const details = run.details as {
      tables: number
      analyzed: number
      sequencesRepaired: number
      checks: { id: string; status: string }[]
    }
    expect(details.tables).toBeGreaterThan(10)
    expect(details.analyzed).toBeLessThanOrEqual(20)
    // Only the checks the page also runs; a job never invents a status.
    for (const check of details.checks) {
      expect(['migrations', 'sequences', 'orphans', 'indexes', 'statistics', 'bloat', 'primary-keys'])
        .toContain(check.id)
    }
  })

  it('runs the nightly database backup into a directory of its own, and prunes it', async () => {
    const os = await import('node:os')
    const path = await import('node:path')
    const fs = await import('node:fs/promises')
    const { databaseBackup } = await import('@/jobs/tasks/databaseBackup')

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pocms-backup-'))
    const previous = { ...process.env }
    process.env.BACKUP_DIR = dir
    // Retention of one, so the second run has something to prune and the plan can be asserted.
    process.env.BACKUP_KEEP = '1'
    try {
      const lines: string[] = []
      const outcome = await databaseBackup.run({
        payload,
        log: (line) => lines.push(line),
        siteURL: null,
      })

      expect(outcome.summary).toMatch(/Wrote pocms-.*\.sql/)
      const details = outcome.details as {
        file: string
        bytes: number
        tables: number
        rows: number
        directory: string
        kept: string[]
        removed: string[]
      }
      expect(details.bytes).toBeGreaterThan(1000)
      expect(details.tables).toBeGreaterThan(20)
      expect(details.directory).toBe(dir)

      // The file is a real dump: it names the tables and can be read back as text.
      const written = await fs.readFile(path.join(dir, details.file), 'utf8')
      expect(written).toContain('CREATE TABLE')
      expect(written).toContain('"articles"')

      // A second run keeps the newest two and deletes the older one.
      await new Promise((resolve) => setTimeout(resolve, 1100))
      const second = await databaseBackup.run({ payload, log: () => undefined, siteURL: null })
      const secondDetails = second.details as { file: string; kept: string[]; removed: string[] }
      expect(secondDetails.file).not.toBe(details.file)
      expect(secondDetails.removed).toEqual([details.file])
      const left = (await fs.readdir(dir)).sort()
      expect(left).toEqual([secondDetails.file])
      expect(secondDetails.kept).toEqual([secondDetails.file])
      expect(lines.join('\n')).toMatch(/Writing to/)
    } finally {
      process.env = previous
      await fs.rm(dir, { recursive: true, force: true })
    }
  }, 180_000)

  it('moves a sequence that fell behind, so the next insert succeeds', async () => {
    const { withDatabase } = await import('@/plugins/databaseTools/server/connection')
    const label = `Sequence drift ${stamp}`
    await withDatabase(async (client) => {
      const { rows } = await client.query<{ seq: string }>(
        `select pg_get_serial_sequence('skills', 'id') as seq`,
      )
      // Behind the highest id: the next insert would reuse a primary key.
      await client.query(`select setval($1, 1, true)`, [rows[0].seq])
    })

    const queued = await queueJob(payload, { task: 'database-upkeep', trigger: 'manual' })
    if (queued.status !== 'queued') throw new Error('expected a queued run')
    track(queued.job)
    await runQueue(payload, { only: 'database-upkeep' })

    const run = await payload.findByID({
      collection: 'job-runs',
      id: queued.job.id,
      overrideAccess: true,
    })
    expect((run.details as { sequencesRepaired: number }).sequencesRepaired).toBeGreaterThan(0)

    // The fix is what it claims: an ordinary insert now gets a free id.
    const created = await payload.create({
      collection: 'skills',
      data: { label, value: 1, group: 'frontend', color: 'primary' },
    })
    expect(created.id).toBeGreaterThan(0)
    await payload.delete({ collection: 'skills', id: created.id })
  })

  it('deletes trash older than the retention window, permanently', async () => {
    const old = new Date(Date.now() - 40 * DAY_MS).toISOString()
    await payload.update({
      collection: 'skills',
      id: skill.id,
      data: { deletedAt: old },
      overrideAccess: true,
    })
    const queued = await queueJob(payload, { task: 'trash-cleanup', trigger: 'cron' })
    if (queued.status !== 'queued') throw new Error('expected a queued run')
    track(queued.job)

    const { ran } = await runQueue(payload, { only: 'trash-cleanup' })
    const run = ran.find((job) => job.id === queued.job.id)
    expect(run).toMatchObject({ status: 'done' })
    expect((run?.details as { removed?: number } | null)?.removed).toBeGreaterThanOrEqual(1)
    expect(run?.summary).toMatch(/Deleted \d+ document/)

    const gone = await payload.find({
      collection: 'skills',
      trash: true,
      where: { id: { equals: skill.id } },
      overrideAccess: true,
    })
    expect(gone.totalDocs).toBe(0)
  })

  it('queues the due tasks for a cron call', async () => {
    const { queued, skipped } = await queueDueJobs(payload, new Date('2026-10-20T03:15:00Z'))
    for (const job of queued) track(job)
    // Tuesday: the daily tasks queue (or report busy); the weekly link check is not due.
    expect(skipped.some((entry) => entry.task === 'broken-links')).toBe(true)
    expect(queued.length + skipped.length).toBe(TASKS.length)
    // Empty the queue again for the access and endpoint tests below.
    await payload.delete({
      collection: 'job-runs',
      where: { status: { equals: 'queued' } },
      overrideAccess: true,
    })
  })

  it('keeps runs readable for roles with the capability only', async () => {
    const asAdmin = await payload.find({
      collection: 'job-runs',
      user: admin,
      overrideAccess: false,
    })
    expect(asAdmin.docs.length).toBeGreaterThan(0)
    // Without the capability the collection is closed, not just empty.
    await expect(
      payload.find({ collection: 'job-runs', user: editor, overrideAccess: false }),
    ).rejects.toThrow(/not allowed/i)
  })

  it('stores page speed reports that only the analytics capability can read', async () => {
    // Remove a leftover from an earlier run of this file.
    await payload.delete({
      collection: 'pagespeed-reports',
      where: { url: { equals: 'https://example.test/' } },
      overrideAccess: true,
    })
    const report = await payload.create({
      collection: 'pagespeed-reports',
      overrideAccess: true,
      data: {
        url: 'https://example.test/',
        finalUrl: 'https://example.test/',
        strategy: 'mobile',
        fetchedAt: new Date().toISOString(),
        lighthouseVersion: '12.0.0',
        scores: [{ key: 'performance', label: 'Performance', score: 91, rating: 'good' }],
      },
    })
    const asAdmin = await payload.find({
      collection: 'pagespeed-reports',
      where: { url: { equals: 'https://example.test/' } },
      user: admin,
      overrideAccess: false,
    })
    expect(asAdmin.totalDocs).toBe(1)
    expect(asAdmin.docs[0].scores?.[0]).toMatchObject({ key: 'performance', score: 91 })
    // The built-in Editor role has the analytics capability; a role without it is refused.
    const asEditor = await payload.find({
      collection: 'pagespeed-reports',
      user: editor,
      overrideAccess: false,
    })
    expect(asEditor.totalDocs).toBe(1)
    await expect(
      payload.find({ collection: 'pagespeed-reports', user: viewer, overrideAccess: false }),
    ).rejects.toThrow(/not allowed/i)
    await payload.delete({ collection: 'pagespeed-reports', id: report.id, overrideAccess: true })
  })

  it('the cron endpoint refuses to run without the secret', async () => {
    const handler = jobsCronEndpoint.handler as (req: never) => Promise<Response>
    const saved = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    const unconfigured = await handler({
      headers: new Headers(),
      searchParams: new URLSearchParams(),
      payload,
    } as never)
    expect(unconfigured.status).toBe(503)

    process.env.CRON_SECRET = 'int-test-cron-secret'
    const unauthorized = await handler({
      headers: new Headers(),
      searchParams: new URLSearchParams(),
      payload,
    } as never)
    expect(unauthorized.status).toBe(401)

    if (saved) process.env.CRON_SECRET = saved
    else delete process.env.CRON_SECRET
  })
})
