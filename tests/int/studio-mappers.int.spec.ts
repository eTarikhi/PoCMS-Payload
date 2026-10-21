import { describe, expect, it } from 'vitest'
import type { Article, Media, Project } from '@/payload-types'
import { mapArticles, mapProjects } from '@/app/(frontend)/lib/mappers'

const timestamp = '2026-10-22T00:00:00.000Z'
const media: Media = {
  id: 1,
  alt: 'Uploaded screenshot',
  url: '/api/media/file/screenshot.webp',
  createdAt: timestamp,
  updatedAt: timestamp,
}
const project: Project = {
  id: 1,
  title: 'Portfolio',
  categories: ['front-end'],
  createdAt: timestamp,
  updatedAt: timestamp,
}
const article: Article = {
  id: 1,
  title: 'A field note',
  excerpt: 'An excerpt',
  link: 'https://example.com/post',
  publishedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
}

describe('Studio content mapping', () => {
  it('respects explicit project image URLs ahead of uploads', () => {
    const [result] = mapProjects([
      {
        ...project,
        image: media,
        src: '/images/full.webp',
        placeHolder: '/images/thumb.webp',
        readMoreUrl: 'https://example.com/story',
      },
    ]).items
    expect(result.imageUrl).toBe('/images/full.webp')
    expect(result.thumbnailUrl).toBe('/images/thumb.webp')
    expect(result.readMoreUrl).toBe('https://example.com/story')
  })

  it('uses the upload when legacy image URLs are empty', () => {
    const [result] = mapProjects([{ ...project, image: media, src: '', placeHolder: '' }]).items
    expect(result.imageUrl).toBe(media.url)
    expect(result.thumbnailUrl).toBe(media.url)
  })

  it('handles unresolved media IDs and missing links without fabricating a case study', () => {
    const [result] = mapProjects([{ ...project, image: 42 }]).items
    expect(result.imageUrl).toBe('')
    expect(result.url).toBe('#')
    expect(result.readMoreUrl).toBeUndefined()
  })

  it('exposes featured writing but creates local paths only with a slug and body', () => {
    const results = mapArticles([
      { ...article, featured: true, slug: 'note', description: 'An article body.' },
      { ...article, id: 2, slug: 'external', description: '  ' },
    ])
    expect(results[0].featured).toBe(true)
    expect(results[0].pagePath).toBe('/articles/note')
    expect(results[1].pagePath).toBeNull()
  })
})
