import { describe, expect, it } from 'vitest'
import { buildWritingFeed } from '@/app/(frontend)/lib/rss'
import type { ArticleItem } from '@/app/(frontend)/lib/types'
const article: ArticleItem = {
  id: '1',
  title: 'Field note',
  excerpt: 'An excerpt',
  author: 'October 22, 2026',
  readTime: '2 min',
  imageUrl: '',
  link: 'https://example.test/post',
  pagePath: '/articles/note',
  category: 'articles',
}
const parse = (items: ArticleItem[], name = 'Studio') =>
  new DOMParser().parseFromString(
    buildWritingFeed('https://studio.test/', name, items),
    'application/xml',
  )
describe('Writing RSS feed', () => {
  it('publishes valid RSS and prefers local pages over external publication links', () => {
    const doc = parse([article])
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelector('item > link')?.textContent).toBe('https://studio.test/articles/note')
    expect(doc.querySelector('guid')?.textContent).toBe('urn:pocms:article:1')
    expect(doc.querySelector('guid')?.getAttribute('isPermaLink')).toBe('false')
    expect(doc.querySelector('channel > link')?.textContent).toBe('https://studio.test/articles')
    expect(doc.querySelector('pubDate')).toBeNull()
  })
  it('escapes all CMS strings and removes XML-forbidden controls without losing Unicode', () => {
    const text = '<script> & "quotes" 日本語\u0001\ud800'
    const doc = parse([{ ...article, title: text, excerpt: text }], text)
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.querySelector('item > title')?.textContent).toBe('<script> & "quotes" 日本語')
    expect(doc.querySelector('description')?.textContent).toBe(
      'Field notes on interfaces, systems, and software development.',
    )
    expect(doc.querySelector('item > description')?.textContent).toBe('<script> & "quotes" 日本語')
  })
  it('uses HTTP(S) external destinations, rejecting invalid, unsafe and credentialed URLs', () => {
    const doc = parse(
      [
        'https://example.test/read?q=one&sort=two',
        'javascript:alert(1)',
        'not-a-url',
        'https://user:pass@example.test/private',
        'data:text/html,hello',
      ].map((link, i) => ({ ...article, id: String(i), pagePath: null, link })),
    )
    expect(doc.querySelectorAll('item')).toHaveLength(1)
    expect(doc.querySelector('item > link')?.textContent).toBe(
      'https://example.test/read?q=one&sort=two',
    )
  })
  it('deduplicates by stable document ID, keeps source order and bounds the feed to 50 entries', () => {
    const doc = parse([
      article,
      article,
      ...Array.from({ length: 70 }, (_, i) => ({
        ...article,
        id: String(i + 2),
        title: `Note ${i}`,
      })),
    ])
    expect(doc.querySelectorAll('item')).toHaveLength(50)
    expect(doc.querySelector('item > title')?.textContent).toBe('Field note')
  })
  it('can publish an honest empty feed without inventing content', () => {
    expect(parse([]).querySelectorAll('item')).toHaveLength(0)
    expect(parse([]).querySelector('parsererror')).toBeNull()
  })
})
