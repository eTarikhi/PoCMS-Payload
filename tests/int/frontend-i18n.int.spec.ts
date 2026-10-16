import { describe, expect, it } from 'vitest'

import { buildArticleMetadata, homeMetadata } from '@/app/(frontend)/lib/seo'
import { getMessages } from '@/i18n/messages'

describe('public frontend localization', () => {
  it('returns translated navigation and accessibility messages for Persian', () => {
    const messages = getMessages('fa')

    expect(messages.navigation.home).toBe('خانه')
    expect(messages.common.skipToContent).toBe('پرش به محتوا')
    expect(messages.projects.all).toBe('همه پروژه‌ها')
  })

  it('builds Persian homepage metadata with canonical and hreflang URLs', () => {
    const metadata = homeMetadata('fa', 'https://portfolio.example')

    expect(metadata.alternates).toEqual({
      canonical: 'https://portfolio.example/fa',
      languages: {
        en: 'https://portfolio.example/',
        fa: 'https://portfolio.example/fa',
        'x-default': 'https://portfolio.example/',
      },
    })
    expect(metadata.openGraph).toMatchObject({
      locale: 'fa_IR',
      url: 'https://portfolio.example/fa',
    })
  })

  it('keeps an article canonical in its current locale and advertises its English alternate', () => {
    const metadata = buildArticleMetadata(
      {
        slug: 'payload-localization',
        title: 'بومی‌سازی در Payload',
        excerpt: 'راهنمای بومی‌سازی محتوا',
        category: 'articles',
        publishedAt: '2026-10-16T00:00:00.000Z',
        publishedDisplay: '۲۴ مهر ۱۴۰۵',
        readTimeDisplay: '۳ دقیقه',
        coverUrl: null,
        coverAlt: 'تصویر مقاله',
        paragraphs: [],
        externalLink: null,
      },
      'fa',
      'https://portfolio.example',
    )

    expect(metadata.alternates).toMatchObject({
      canonical: 'https://portfolio.example/fa/articles/payload-localization',
      languages: {
        en: 'https://portfolio.example/articles/payload-localization',
        fa: 'https://portfolio.example/fa/articles/payload-localization',
      },
    })
    expect(metadata.openGraph).toMatchObject({ locale: 'fa_IR' })
  })
})
