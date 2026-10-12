import { describe, expect, it, vi } from 'vitest'
import type { Payload, TypedUser } from 'payload'
import { loadOverview } from '../../src/components/admin/dashboard-data'

const user = { id: 1, email: 'editor@example.com', collection: 'users' } as unknown as TypedUser

describe('admin dashboard data', () => {
  it('does not query or expose content without readable collections', async () => {
    const find = vi.fn()
    expect(await loadOverview({ find } as unknown as Payload, user, [])).toEqual({
      overview: [],
      recent: [],
    })
    expect(find).not.toHaveBeenCalled()
  })

  it('queries only allowed collections with the signed-in user and access checks enabled', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 2, docs: [] })
    const { overview } = await loadOverview({ find } as unknown as Payload, user, [
      'projects',
      'media',
    ])

    expect(overview).toEqual([
      { slug: 'projects', count: 2 },
      { slug: 'media', count: 2 },
    ])
    expect(find).toHaveBeenCalledTimes(2)
    expect(find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'projects',
        user,
        overrideAccess: false,
        depth: 0,
      }),
    )
    expect(find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'media',
        user,
        overrideAccess: false,
        depth: 0,
      }),
    )
  })

  it('distinguishes failed queries from zero content and sorts recent edits', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({
        totalDocs: 1,
        docs: [{ id: 7, title: 'Project', updatedAt: '2026-01-01T00:00:00Z' }],
      })
      .mockResolvedValueOnce({
        totalDocs: 0,
        docs: [{ id: 8, title: 'Article', updatedAt: '2026-02-01T00:00:00Z' }],
      })
      .mockRejectedValueOnce(new Error('database unavailable'))
    const result = await loadOverview({ find } as unknown as Payload, user, [
      'projects',
      'articles',
      'media',
    ])

    expect(result.overview).toEqual([
      { slug: 'projects', count: 1 },
      { slug: 'articles', count: 0 },
      { slug: 'media', count: null },
    ])
    expect(result.recent.map(({ id }) => id)).toEqual([8, 7])
  })
})
