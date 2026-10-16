import { articlePagePath, hasArticlePage } from '@/app/(frontend)/lib/article-page'
import type { CollectionConfig } from 'payload'
import {
  articleSlugBeforeValidate,
  portfolioAfterChange,
  portfolioAfterDelete,
} from '../app/(frontend)/lib/hooks'

export const Articles: CollectionConfig = {
  slug: 'articles',
  hooks: {
    beforeValidate: [articleSlugBeforeValidate],
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    group: 'Content',
    description: 'Blog posts, listed under /articles.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishedAt', 'featured'],
    // Live Preview and the Preview button open the article page; only articles with a slug and a
    // body have one (see hasArticlePage), so the others get no preview.
    livePreview: {
      url: ({ data }) => (hasArticlePage(data) ? articlePagePath(String(data.slug)) : null),
    },
    preview: (doc) => (hasArticlePage(doc) ? articlePagePath(String(doc.slug)) : null),
  },
  defaultSort: 'publishedAt',
  access: {
    read: () => true,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'excerpt', type: 'textarea', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description:
          'URL key for /articles/{slug}. Made from the title when left empty. Keep it stable once the article is shared.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description:
          'Article body, as plain text. Separate paragraphs with a blank line. Leave empty and the article links out only (no page).',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      admin: {
        position: 'sidebar',
        description: 'Show this article in the featured slot on the home page.',
      },
    },
    {
      name: 'category',
      type: 'select',
      index: true,
      options: [
        { label: 'Articles', value: 'articles' },
        { label: 'Others', value: 'others' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'MMMM d, yyyy' },
      },
    },
    {
      name: 'readTime',
      type: 'number',
      min: 1,
      admin: { position: 'sidebar', description: 'Minutes. Shown as "{n} min" on the site.' },
    },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'imageUrl', type: 'text' },
    {
      name: 'link',
      type: 'text',
      required: true,
      admin: { description: 'Where the article is published (LinkedIn, Medium, ...).' },
    },
  ],
}
