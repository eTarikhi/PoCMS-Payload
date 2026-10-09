import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../lib/portfolio/hooks'

export const Articles: CollectionConfig = {
  slug: 'articles',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishedAt', 'featured'],
  },
  defaultSort: 'publishedAt',
  access: {
    read: () => true,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'excerpt', type: 'textarea', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'featured', type: 'checkbox', admin: { description: 'If checked, the article expert will be featured on the homepage.' } },
    {
      name: 'category',
      type: 'select',
      index: true,
      options: [
        { label: 'Articles', value: 'articles' },
        { label: 'Others', value: 'others' },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'MMMM d, yyyy' } },
    },
    {
      name: 'readTime',
      type: 'number',
      min: 1,
      admin: { description: 'Minutes. Render as "{n} min" in the frontend.' },
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
