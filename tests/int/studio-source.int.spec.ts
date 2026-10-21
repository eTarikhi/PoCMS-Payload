import { beforeEach, describe, expect, it, vi } from 'vitest'

const { find, findGlobal } = vi.hoisted(() => ({ find: vi.fn(), findGlobal: vi.fn() }))
vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find, findGlobal })) }))

import {
  fetchRawPortfolioDocs,
  fetchArticleBySlug,
  fetchPublishedArticleSlugs,
} from '@/app/(frontend)/lib/payload-source'

beforeEach(() => {
  find.mockReset().mockResolvedValue({ docs: [] })
  findGlobal.mockReset().mockResolvedValue(null)
})

describe('Public Payload query contract', () => {
  it('enforces anonymous read access and excludes drafts/trash on every content query', async () => {
    await fetchRawPortfolioDocs()
    expect(find).toHaveBeenCalledTimes(9)
    for (const [options] of find.mock.calls) {
      expect(options.overrideAccess).toBe(false)
      expect(options.draft).toBe(false)
      expect(options.trash).toBe(false)
      expect(options.sort).toBeTruthy()
      if (!['header', 'about'].includes(options.collection)) {
        expect(options.pagination).toBe(false)
        expect(options.limit).toBe(0)
      }
    }
    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, draft: false, slug: 'footer' }),
    )
  })
  it('keeps single article reads permission-aware and scoped to the exact slug', async () => {
    expect(await fetchArticleBySlug('hello')).toBeNull()
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideAccess: false,
        draft: false,
        trash: false,
        limit: 1,
        where: { slug: { equals: 'hello' } },
      }),
    )
  })
  it('projects only slug/body fields for sitemap and generation, excluding empty bodies', async () => {
    find.mockResolvedValue({
      docs: [
        { slug: 'hello', description: 'Body' },
        { slug: 'empty', description: '  ' },
        { slug: null, description: 'Body' },
      ],
    })
    expect(await fetchPublishedArticleSlugs()).toEqual(['hello'])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideAccess: false,
        select: { slug: true, description: true },
        limit: 0,
        depth: 0,
      }),
    )
  })
  it('propagates a failed database read instead of substituting sample data', async () => {
    find.mockRejectedValue(new Error('Database unavailable'))
    await expect(fetchRawPortfolioDocs()).rejects.toThrow('Database unavailable')
  })
})
