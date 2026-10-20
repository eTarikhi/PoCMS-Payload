import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import type { AuditLog, Role, Skill, User } from '@/payload-types'

/**
 * Audit log (CR-12 E5): every content write is recorded by the plugin hooks, the entries are
 * immutable and read with the viewAuditLog capability, and secrets never reach the log.
 */
describe('Audit log', () => {
  let payload: Payload
  let administrator: Role
  let auditorRole: Role
  let admin: User
  let auditor: User
  let skill: Skill
  const stamp = Date.now()

  type Change = { field: string; from?: unknown; to?: unknown }
  const changesOf = (entry: AuditLog | undefined): Change[] =>
    Array.isArray(entry?.changes) ? (entry.changes as Change[]) : []

  const entriesFor = async (documentId: number | string, entity = 'skills') => {
    const { docs } = await payload.find({
      collection: 'audit-logs',
      where: { and: [{ entity: { equals: entity } }, { documentId: { equals: String(documentId) } }] },
      sort: 'createdAt',
      limit: 50,
    })
    return docs as AuditLog[]
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    administrator = (
      await payload.find({ collection: 'roles', where: { system: { equals: true } }, limit: 1 })
    ).docs[0] as Role
    auditorRole = (await payload.create({
      collection: 'roles',
      data: {
        name: `Auditor ${stamp}`,
        description: 'Reads the audit log, changes nothing.',
        capabilities: { viewAuditLog: true },
      },
    })) as Role
    admin = await payload.create({
      collection: 'users',
      data: {
        email: `audit-admin-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [administrator.id],
      },
    })
    auditor = await payload.create({
      collection: 'users',
      data: {
        email: `audit-reader-${stamp}@example.test`,
        password: 'int-test-1',
        roles: [auditorRole.id],
      },
    })
  })

  afterAll(async () => {
    await payload.delete({
      collection: 'skills',
      where: { label: { like: `Audit test ${stamp}` } },
      trash: true,
    })
    await payload.delete({
      collection: 'users',
      where: { email: { like: `-${stamp}@example.test` } },
      trash: true,
    })
    await payload.delete({
      collection: 'roles',
      where: { name: { like: `${stamp}` } },
    })
  })

  it('records a creation with who, what and where', async () => {
    skill = await payload.create({
      collection: 'skills',
      data: {
        label: `Audit test ${stamp}`,
        value: 42,
        group: 'backend',
        color: 'info',
        order: 900,
      },
      user: admin,
      overrideAccess: false,
    })

    const entries = await entriesFor(skill.id)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      action: 'create',
      entity: 'skills',
      entityLabel: 'Skill',
      entityKind: 'collection',
      documentTitle: `Audit test ${stamp}`,
      userEmail: admin.email,
    })
    expect(entries[0].summary).toContain(admin.email)
    expect(entries[0].summary).toContain('created')
    expect(changesOf(entries[0]).map((change) => change.field)).toContain('label')
  })

  it('records an update with the fields that changed', async () => {
    await payload.update({
      collection: 'skills',
      id: skill.id,
      data: { value: 73 },
      user: admin,
      overrideAccess: false,
    })

    const update = (await entriesFor(skill.id)).find((entry) => entry.action === 'update')
    expect(update).toBeTruthy()
    expect(changesOf(update)).toEqual([{ field: 'value', from: 42, to: 73 }])
  })

  it('records trash and restore as their own actions', async () => {
    await payload.update({
      collection: 'skills',
      id: skill.id,
      data: { deletedAt: new Date().toISOString() },
      user: admin,
      overrideAccess: false,
    })
    await payload.update({
      collection: 'skills',
      id: skill.id,
      data: { deletedAt: null },
      trash: true,
      user: admin,
      overrideAccess: false,
    })

    const actions = (await entriesFor(skill.id)).map((entry) => entry.action)
    expect(actions).toContain('trash')
    expect(actions).toContain('restore')
  })

  it('records a permanent delete', async () => {
    const temporary = await payload.create({
      collection: 'skills',
      data: {
        label: `Audit test ${stamp} temp`,
        value: 10,
        group: 'backend',
        color: 'info',
        order: 901,
      },
      user: admin,
      overrideAccess: false,
    })
    await payload.delete({
      collection: 'skills',
      id: temporary.id,
      trash: true,
      user: admin,
      overrideAccess: false,
    })

    const entries = await entriesFor(temporary.id)
    expect(entries.map((entry) => entry.action)).toContain('delete')
    expect(entries.at(-1)?.summary).toContain('permanently')
  })

  it('records sign-ins', async () => {
    const login = await payload.login({
      collection: 'users',
      data: { email: auditor.email, password: 'int-test-1' },
    })
    expect(login.token).toBeTruthy()

    const { docs } = await payload.find({
      collection: 'audit-logs',
      where: {
        and: [
          { action: { equals: 'login' } },
          { documentId: { equals: String(auditor.id) } },
        ],
      },
    })
    expect((docs as AuditLog[])[0]).toMatchObject({
      action: 'login',
      entity: 'users',
      userEmail: auditor.email,
    })
  })

  it('is readable with the capability and closed to everyone else', async () => {
    const allowed = await payload.find({
      collection: 'audit-logs',
      user: auditor,
      overrideAccess: false,
      limit: 1,
    })
    expect(allowed.totalDocs).toBeGreaterThan(0)

    const denied = await payload.find({
      collection: 'audit-logs',
      user: admin,
      overrideAccess: false,
      limit: 1,
    })
    // Administrators hold every capability, including viewAuditLog.
    expect(denied.totalDocs).toBeGreaterThan(0)

    await expect(
      payload.create({
        collection: 'audit-logs',
        data: { action: 'update', summary: 'forged', entity: 'skills' },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('cannot be edited or deleted, even by an administrator', async () => {
    const [entry] = await entriesFor(skill.id)
    await expect(
      payload.update({
        collection: 'audit-logs',
        id: entry.id,
        data: { summary: 'rewritten' },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: 'audit-logs',
        id: entry.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('never stores secrets or long values in the change list', async () => {
    await payload.update({
      collection: 'users',
      id: auditor.id,
      data: { password: 'another-test-password' },
      user: admin,
      overrideAccess: false,
    })
    const userEntries = await entriesFor(auditor.id, 'users')
    const update = userEntries.find((entry) => entry.action === 'update')
    expect(update).toBeTruthy()
    const fields = changesOf(update).map((change) => change.field)
    expect(fields).not.toContain('password')
    expect(fields).not.toContain('sessions')

    const long = 'x'.repeat(400)
    await payload.update({
      collection: 'skills',
      id: skill.id,
      data: { label: long },
      user: admin,
      overrideAccess: false,
    })
    const last = (await entriesFor(skill.id)).at(-1)
    const label = changesOf(last).find((change) => change.field === 'label')
    expect(typeof label?.to).toBe('string')
    expect(String(label?.to).length).toBeLessThan(200)
    expect(String(label?.to).endsWith('…')).toBe(true)
  })

  it('skips writes made with context.skipAudit (the seed)', async () => {
    const quiet = await payload.create({
      collection: 'skills',
      data: {
        label: `Audit test ${stamp} quiet`,
        value: 1,
        group: 'backend',
        color: 'info',
        order: 902,
      },
      user: admin,
      overrideAccess: false,
      context: { skipAudit: true },
    })
    expect(await entriesFor(quiet.id)).toHaveLength(0)
    await payload.delete({ collection: 'skills', id: quiet.id, trash: true })
  })
})
