import { can } from '@/access/permissions'
import { contentAccess, hiddenWithout } from '@/access/roles'
import { imageSourceField } from './imageSource'
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
    hidden: hiddenWithout('articles'),
    group: 'Content',
    description: 'Blog posts, listed under /articles.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishedAt', 'featured'],
    // Live Preview and the Preview button open the article page; only articles with a slug and a
    // body have one (see hasArticlePage), so the others get no preview.
    livePreview: {
      // The preview route is dynamic and renders drafts; the public page stays static and
      // published-only. `id` gives the preview component the document to resolve relations for.
      url: ({ data }) =>
        hasArticlePage(data)
          ? `/preview/articles/${String(data.slug)}?id=${String(data.id ?? '')}`
          : null,
    },
    preview: (doc) => (hasArticlePage(doc) ? articlePagePath(String(doc.slug)) : null),
  },
  // Drafts and versions (CNT): an editor can write and preview an article for days before it goes
  // live. Public reads skip drafts by default, so a draft is invisible until it is published.
  versions: {
    drafts: true,
    maxPerDoc: 20,
  },
  defaultSort: 'publishedAt',
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  // Drafts change "public": an anonymous reader only sees published articles, while the admin's
  // signed-in readers see drafts too — that is what makes a draft private until it is published.
  access: {
    ...contentAccess('articles'),
    read: ({ req }) =>
      req.user ? can(req.user, 'articles', 'read') : { _status: { equals: 'published' } },
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
      name: 'publishAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        // Only meaningful while the article is still a draft.
        condition: (data) => data?._status !== 'published',
        date: { pickerAppearance: 'dayAndTime' },
        description:
          'Publish this draft automatically at this time. The daily jobs cron checks; Admin › Scheduled jobs → Run now publishes immediately.',
      },
    },
    {
      name: 'readTime',
      type: 'number',
      min: 1,
      admin: { position: 'sidebar', description: 'Minutes. Shown as "{n} min" on the site.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Cover image',
      admin: {
        description: 'Shown on the article card and at the top of the article page.',
        // One control for both sources: the upload and the legacy URL below (P5.2).
        components: imageSourceField({
          urlField: 'imageUrl',
          urlLabel: 'External image URL',
          urlDescription:
            'Used only when no cover is chosen above. For images hosted outside the media library.',
        }),
      },
    },
    // Edited through the Image source control above; kept in the API and hidden in the form.
    { name: 'imageUrl', type: 'text', admin: { hidden: true } },
    {
      name: 'link',
      type: 'text',
      required: true,
      admin: { description: 'Where the article is published (LinkedIn, Medium, ...).' },
    },
  ],
}
