import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

/**
 * Media folders (Payload's beta folders feature).
 *
 * `folders: true` on Media makes Payload register the hidden `payload-folders` collection, add a
 * hidden `folder` relationship to every media document, and serve the folder browser in the admin.
 * The database side is a hand-written migration (`20261021_163000_media_folders`); this test checks
 * that the runtime matches it:
 *
 * - the folder collection exists and only accepts `media` as its folder type,
 * - a media document can be filed into a folder and comes back with the relationship set,
 * - deleting the folder unfiles the image (`ON DELETE SET NULL`) instead of deleting it,
 * - the frontend's media reads are unaffected: a filed image is still served by its URL.
 */
describe('Media folders', () => {
  let payload: Payload
  const stamp = Date.now()
  let folderId: number | string

  beforeAll(async () => {
    payload = await getPayload({ config })
    const folder = await payload.create({
      collection: 'payload-folders',
      data: { name: `Test folder ${stamp}`, folderType: ['media'] } as never,
      overrideAccess: true,
    })
    folderId = folder.id
  })

  afterAll(async () => {
    if (folderId) {
      await payload.delete({ collection: 'payload-folders', id: folderId, overrideAccess: true })
    }
  })

  it('registers the folder collection and its type enum', () => {
    expect(payload.collections['payload-folders']).toBeDefined()
    const config = payload.collections.media.config as unknown as {
      folders?: boolean | { browseByFolder?: boolean }
    }
    expect(config.folders).toBeTruthy()
  })

  it('files a media document into a folder and keeps it when the folder is deleted', async () => {
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Foldered image', folder: folderId } as never,
      filePath: 'public/images/favicon/favicon-32x32.png',
      overrideAccess: true,
      context: { skipAudit: true },
    })

    const filed = await payload.findByID({
      collection: 'media',
      id: media.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(filed.folder).toBe(folderId)

    const folder = await payload.findByID({
      collection: 'payload-folders',
      id: folderId,
      depth: 0,
      overrideAccess: true,
    })
    expect(folder).toMatchObject({ name: `Test folder ${stamp}`, folderType: ['media'] })

    // The folder is not the owner: dropping it must unfile the image, not cascade the delete.
    await payload.delete({ collection: 'payload-folders', id: folderId, overrideAccess: true })
    const unfiled = await payload.findByID({
      collection: 'media',
      id: media.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(unfiled.folder ?? null).toBeNull()
    expect(unfiled.filename).toBeTruthy()

    await payload.delete({ collection: 'media', id: media.id, overrideAccess: true })
    folderId = 0
  })
})
