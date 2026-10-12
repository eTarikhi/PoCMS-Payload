import type { CollectionConfig } from 'payload'
import { articleSlugBeforeValidate, portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Articles: CollectionConfig = {
  slug: 'articles',
  hooks: {
    beforeValidate: [articleSlugBeforeValidate],
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    group: 'Content',
    description:
      'Blog and news entries shown on the homepage article section and at /articles/{slug}.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishedAt', 'featured'],
    listSearchableFields: ['title', 'slug', 'excerpt'],
    components: {
      beforeList: ['/admin/lists/ListSummary.tsx'],
    },
    // Live Preview opens the article page (only articles with a slug and body have one).
    livePreview: {
      url: ({ data }) =>
        data?.slug && data?.description ? `/articles/${data.slug}` : undefined,
    },
    // Preview button in the document header, same rule as Live Preview.
    preview: (doc) =>
      doc?.slug && doc?.description ? `/articles/${String(doc.slug)}` : null,
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
        description: 'URL key for /articles/{slug}. Made from the title when left empty. Keep it stable once the article is shared.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Article body, as plain text. Separate paragraphs with a blank line. Leave empty and the article links out only (no page).',
      },
    },
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
