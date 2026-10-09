/**
 * Tests for the Set 6 integration: cache tag, revalidation hooks, and the home-page composition.
 *
 * `next/cache` and `next/headers` are mocked, so no database or Next runtime is needed. The database path is
 * checked separately against a running app (see docs/migration/03, Set 6).
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getPortfolioContent: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  payloadAuth: vi.fn(),
  /** Options passed to unstable_cache. Not cleared between tests, because cache.ts runs once at import time. */
  unstableCacheCalls: [] as unknown[][],
}))

vi.mock('next/cache', () => ({
  revalidateTag: cacheMocks.revalidateTag,
  // The real unstable_cache wraps the function. The mock passes it through so the wrapper can be checked.
  unstable_cache: (fn: unknown, keys: unknown, options: unknown) => {
    cacheMocks.unstableCacheCalls.push([keys, options])
    return fn
  },
}))

vi.mock('next/headers', () => ({
  headers: cacheMocks.headers,
  cookies: cacheMocks.cookies,
}))

// The real cache wrapper runs. Only the Payload query is replaced by the fixture in each test.
vi.mock('../../src/app/(frontend)/lib/payload-source', () => ({
  getPortfolioContent: cacheMocks.getPortfolioContent,
}))

// The Bootstrap bundle changes global state when imported. It is not needed for the composition test.
vi.mock('bootstrap/dist/js/bootstrap.bundle.js', () => ({}))

import { toPayloadDocs } from '../helpers/portfolio-fixtures'
import { mapPortfolioContent } from '../../src/app/(frontend)/lib/mappers'
import { portfolioAfterChange, portfolioAfterDelete } from '../../src/app/(frontend)/lib/hooks'
import { revalidatePortfolio } from '../../src/app/(frontend)/lib/revalidate'
import { PORTFOLIO_CACHE_TAG } from '../../src/app/(frontend)/lib/revalidate'
import { getCachedPortfolioContent } from '../../src/app/(frontend)/lib/cache'
import { Header as HeaderCollection } from '../../src/collections/Header'
import { About } from '../../src/collections/About'
import { Articles } from '../../src/collections/Articles'
import { Certificates } from '../../src/collections/Certificates'
import { Educations } from '../../src/collections/Educations'
import { Experiences } from '../../src/collections/Experiences'
import { Media } from '../../src/collections/Media'
import { Projects } from '../../src/collections/Projects'
import { Services } from '../../src/collections/Services'
import { Skills } from '../../src/collections/Skills'
import { Users } from '../../src/collections/Users'
import { Footer } from '../../src/globals/Footer'
import { VisibleIntersectionObserver } from '../helpers/visible-intersection-observer'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('revalidatePortfolio', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('marks the portfolio tag stale with the max profile', () => {
    revalidatePortfolio()
    expect(cacheMocks.revalidateTag).toHaveBeenCalledTimes(1)
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(PORTFOLIO_CACHE_TAG, 'max')
    expect(PORTFOLIO_CACHE_TAG).toBe('portfolio')
  })

  it('logs and does not throw when the cache call fails, so an editor save still succeeds', () => {
    cacheMocks.revalidateTag.mockImplementation(() => {
      throw new Error('cache store unavailable')
    })
    expect(() => revalidatePortfolio()).not.toThrow()
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})

describe('revalidation hooks', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('afterChange revalidates once and returns the doc unchanged', () => {
    const doc = { id: 1, sureName: 'Amir' }
    const result = portfolioAfterChange({ doc } as never)
    expect(result).toBe(doc)
    expect(cacheMocks.revalidateTag).toHaveBeenCalledTimes(1)
  })

  it('afterDelete revalidates once', () => {
    portfolioAfterDelete({ doc: { id: 1 } } as never)
    expect(cacheMocks.revalidateTag).toHaveBeenCalledTimes(1)
  })

  it('a failing cache call does not stop the hook from returning', () => {
    cacheMocks.revalidateTag.mockImplementation(() => {
      throw new Error('boom')
    })
    const doc = { id: 2 }
    expect(portfolioAfterChange({ doc } as never)).toBe(doc)
  })

  it('is attached to the 10 content collections and the footer global, and to nothing else', () => {
    const contentCollections = [
      HeaderCollection,
      About,
      Skills,
      Experiences,
      Educations,
      Certificates,
      Articles,
      Services,
      Projects,
      Media,
    ]
    expect(contentCollections).toHaveLength(10)

    for (const collection of contentCollections) {
      // Checked as arrays. `toContain` alone does not fail when the value is undefined.
      expect(Array.isArray(collection.hooks?.afterChange), collection.slug).toBe(true)
      expect(Array.isArray(collection.hooks?.afterDelete), collection.slug).toBe(true)
      expect(collection.hooks?.afterChange, collection.slug).toContain(portfolioAfterChange)
      expect(collection.hooks?.afterDelete, collection.slug).toContain(portfolioAfterDelete)
    }

    expect(Array.isArray(Footer.hooks?.afterChange)).toBe(true)
    expect(Footer.hooks?.afterChange).toContain(portfolioAfterChange)

    // Users is not content, so its saves do not refresh the public page.
    expect(Users.hooks).toBeUndefined()
  })
})

describe('getCachedPortfolioContent', () => {
  it('is registered with the portfolio tag and a fixed key', () => {
    expect(cacheMocks.unstableCacheCalls).toContainEqual([
      ['portfolio-content'],
      { tags: [PORTFOLIO_CACHE_TAG] },
    ])
  })

  it('returns the content from the Payload query', async () => {
    const content = mapPortfolioContent(toPayloadDocs())
    cacheMocks.getPortfolioContent.mockResolvedValue(content)
    await expect(getCachedPortfolioContent()).resolves.toBe(content)
  })
})

describe('HomePage composition', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', VisibleIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the sections in the original order and never reads request-scoped APIs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const content = mapPortfolioContent(toPayloadDocs())
    cacheMocks.getPortfolioContent.mockResolvedValue(content)

    const { default: HomePage } = await import('../../src/app/(frontend)/page')
    const { container } = render(await HomePage())

    // The original order in vTarikhi/pages/index.js: nav, header, main (about, services, skills, certificates,
    // projects, articles), footer.
    const sectionIds = Array.from(container.querySelectorAll('main > section')).map((el) => el.id)
    expect(sectionIds).toEqual(['about', 'service', 'skill', 'certificate', 'project', 'article'])

    expect(container.querySelector('nav.navbar')).not.toBeNull()
    expect(container.querySelector('header #home')).not.toBeNull()
    expect(container.querySelector('footer')).not.toBeNull()

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(JSON.parse(script!.innerHTML)['@type']).toBe('Person')

    expect(cacheMocks.headers).not.toHaveBeenCalled()
    expect(cacheMocks.cookies).not.toHaveBeenCalled()
    expect(cacheMocks.payloadAuth).not.toHaveBeenCalled()
  })

  it('omits the hero and footer when their data is missing, without failing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const content = { ...mapPortfolioContent(toPayloadDocs()), header: null, footer: null }
    cacheMocks.getPortfolioContent.mockResolvedValue(content)

    const { default: HomePage } = await import('../../src/app/(frontend)/page')
    const { container } = render(await HomePage())

    expect(container.querySelector('#home')).toBeNull()
    expect(container.querySelector('footer')).toBeNull()
    expect(container.querySelectorAll('main > section').length).toBe(6)
  })
})
