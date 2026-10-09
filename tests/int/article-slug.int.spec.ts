/**
 * Tests for article slugs (article page spec §3): slugify, unique suffixes, and the collection hook.
 * Pure logic, with a fake Payload request. No database is needed.
 */

import { describe, expect, it } from 'vitest'

import { articleSlugBeforeValidate } from '../../src/app/(frontend)/lib/hooks'
import { ARTICLE_SLUG_MAX_LENGTH, slugify, withUniqueSuffix } from '../../src/app/(frontend)/lib/slug'

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('The Best Code Editors: A Comprehensive Guide')).toBe(
      'the-best-code-editors-a-comprehensive-guide',
    )
  })

  it('folds Turkish letters to ASCII', () => {
    expect(slugify('Full-Stack Geliştiriciler İçin DevOps')).toBe('full-stack-gelistiriciler-icin-devops')
    expect(slugify('Çağdaş Öğrenme Üzerine')).toBe('cagdas-ogrenme-uzerine')
    expect(slugify('ığüş')).toBe('igus')
  })

  it('removes punctuation and collapses repeated separators', () => {
    expect(slugify('  Hello,   world!!  -- again ')).toBe('hello-world-again')
  })

  it('never returns more than the maximum length, and never ends with a hyphen', () => {
    const long = 'word '.repeat(40)
    const slug = slugify(long)
    expect(slug.length).toBeLessThanOrEqual(ARTICLE_SLUG_MAX_LENGTH)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.startsWith('-')).toBe(false)
  })

  it('falls back to "article" when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('article')
    expect(slugify('')).toBe('article')
  })
})

describe('withUniqueSuffix', () => {
  it('returns the base when it is free', async () => {
    const taken = new Set<string>()
    expect(await withUniqueSuffix('devops', async (c) => taken.has(c))).toBe('devops')
  })

  it('adds -2, -3, and so on while candidates are taken', async () => {
    const taken = new Set(['devops', 'devops-2'])
    expect(await withUniqueSuffix('devops', async (c) => taken.has(c))).toBe('devops-3')
  })
})

type Row = { id: number; slug: string }

/** A fake request. Its `find` applies the slug and id filters the hook sends, the way the database would. */
const fakeReq = (rows: Row[]) => ({
  payload: {
    find: async ({ where }: { where: Record<string, unknown> }) => {
      const clauses = (where.and as Record<string, unknown>[] | undefined) ?? [where]
      const docs = rows.filter((row) =>
        clauses.every((clause) => {
          if (clause.slug) return row.slug === (clause.slug as { equals: string }).equals
          if (clause.id) return row.id !== (clause.id as { not_equals: number }).not_equals
          return true
        }),
      )
      return { docs }
    },
  },
})

const runHook = (args: {
  data: Record<string, unknown>
  operation: 'create' | 'update'
  originalDoc?: Record<string, unknown>
  rows?: Row[]
}) =>
  articleSlugBeforeValidate({
    data: args.data,
    originalDoc: args.originalDoc,
    operation: args.operation,
    req: fakeReq(args.rows ?? []),
  } as unknown as Parameters<typeof articleSlugBeforeValidate>[0]) as Promise<Record<string, unknown>>

describe('articleSlugBeforeValidate', () => {
  it('creates a slug from the title when none is given', async () => {
    const out = await runHook({ data: { title: 'DevOps Roadmap' }, operation: 'create' })
    expect(out.slug).toBe('devops-roadmap')
  })

  it('adds a suffix when another article already has the slug', async () => {
    const out = await runHook({
      data: { title: 'DevOps Roadmap' },
      operation: 'create',
      rows: [{ id: 9, slug: 'devops-roadmap' }],
    })
    expect(out.slug).toBe('devops-roadmap-2')
  })

  it('normalises a typed slug, so URLs stay ASCII', async () => {
    const out = await runHook({ data: { title: 'Anything', slug: 'Özel Başlık!' }, operation: 'create' })
    expect(out.slug).toBe('ozel-baslik')
  })

  it('keeps the existing slug on update when the field is not in the request', async () => {
    const out = await runHook({
      data: { title: 'A new title' },
      operation: 'update',
      originalDoc: { id: 5, title: 'Old title', slug: 'old-title' },
    })
    expect(out.slug).toBeUndefined()
    expect(out.title).toBe('A new title')
  })

  it('regenerates the slug on update when an editor clears it', async () => {
    const out = await runHook({
      data: { title: 'A new title', slug: '' },
      operation: 'update',
      originalDoc: { id: 5, title: 'Old title', slug: 'old-title' },
    })
    expect(out.slug).toBe('a-new-title')
  })

  it('does not count the article itself as a clash on update', async () => {
    const out = await runHook({
      data: { title: 'DevOps Roadmap', slug: '' },
      operation: 'update',
      originalDoc: { id: 5, title: 'DevOps Roadmap', slug: 'devops-roadmap' },
      rows: [{ id: 5, slug: 'devops-roadmap' }],
    })
    expect(out.slug).toBe('devops-roadmap')
  })

  it('still avoids another article with the same slug on update', async () => {
    const out = await runHook({
      data: { title: 'DevOps Roadmap', slug: '' },
      operation: 'update',
      originalDoc: { id: 5, title: 'Something else', slug: 'something-else' },
      rows: [
        { id: 5, slug: 'something-else' },
        { id: 7, slug: 'devops-roadmap' },
      ],
    })
    expect(out.slug).toBe('devops-roadmap-2')
  })
})
