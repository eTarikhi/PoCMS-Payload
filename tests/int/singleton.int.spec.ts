import { getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createWhileEmpty } from '@/access/singleton'
import config from '@/payload.config'
import type { User } from '@/payload-types'

/** One-document collections (Header, About): create is allowed only while the collection is empty. */
describe('One-document collections', () => {
  let payload: Payload
  let editor: User
  let createdHeaderId: number | undefined
  const email = `int-singleton-${Date.now()}@example.test`

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    editor = await payload.create({ collection: 'users', data: { email, password: 'int-test-1' } })
    if ((await payload.count({ collection: 'header' })).totalDocs === 0) {
      const doc = await payload.create({
        collection: 'header',
        data: { sureName: 'Integration test', professionTexts: ['Tester'] },
      })
      createdHeaderId = doc.id
    }
  })

  afterAll(async () => {
    if (createdHeaderId !== undefined)
      await payload.delete({ collection: 'header', id: createdHeaderId })
    await payload.delete({ collection: 'users', where: { email: { equals: email } } })
  })

  it('allows create only for signed-in users while no document exists', async () => {
    const access = createWhileEmpty('about')
    const req = (user: User | null, totalDocs: number) =>
      ({ user, payload: { count: async () => ({ totalDocs }) } }) as unknown as PayloadRequest

    expect(await access({ req: req(editor, 0) })).toBe(true)
    expect(await access({ req: req(editor, 1) })).toBe(false)
    expect(await access({ req: req(null, 0) })).toBe(false)
  })

  it('refuses a second Header document through the Local API with access control on', async () => {
    await expect(
      payload.create({
        collection: 'header',
        data: { sureName: 'Second header', professionTexts: ['Duplicate'] },
        overrideAccess: false,
        user: editor,
      }),
    ).rejects.toThrow()
  })
})
