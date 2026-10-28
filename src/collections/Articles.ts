import type { CollectionConfig } from 'payload'

import { draftContentAccess, hiddenWithout } from '@/access/roles'
import { articlePagePath, hasArticlePage } from '@/app/(frontend)/lib/article-page'
import { contentLexicalEditor } from '@/fields/richText'

import {
  articleAfterChange,
  articleAfterDelete,
  articleSlugBeforeValidate,
  computeReadTimeBeforeChange,
} from '../app/(frontend)/lib/hooks'

export const Articles: CollectionConfig = {
  slug: 'articles',
  versions: {
    maxPerDoc: 25,
    drafts: {
      autosave: { interval: 1000 },
      schedulePublish: true,
    },
  },
  hooks: {
    beforeValidate: [articleSlugBeforeValidate],
    beforeChange: [computeReadTimeBeforeChange],
    afterChange: [articleAfterChange],
    afterDelete: [articleAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('articles'),
    group: 'Content',
    description: 'Blog posts and technical articles, listed on the home page and under /articles.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', '_status', 'publishedAt', 'readTime', 'featured'],
    // Live Preview and the Preview button open the article page; only articles with a slug and a
    // body have one (see hasArticlePage), so link-out entries without a body get no preview.
    livePreview: {
      url: ({ data }) => (hasArticlePage(data) ? articlePagePath(String(data.slug)) : null),
    },
    preview: (doc) =>
      hasArticlePage(doc)
        ? `/api/draft?collection=articles&slug=${encodeURIComponent(String(doc.slug))}`
        : null,
  },
  defaultSort: '-publishedAt',
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Public visitors read published (or legacy pre-draft) posts; signed-in editors also read drafts & versions.
  access: draftContentAccess('articles'),
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
      name: 'content',
      type: 'richText',
      label: 'Article Body',
      editor: contentLexicalEditor,
      admin: {
        description:
          'Rich-text article body with headings (drives Table of Contents), Code, Callout, and Media blocks. Leave empty if the article only links out externally.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Legacy Plain-Text Body',
      admin: {
        condition: (_, siblingData) =>
          Boolean(typeof siblingData?.description === 'string' && siblingData.description.trim()),
        description:
          'Legacy plain-text body preserved from earlier versions. Prefer the Rich Text Article Body above.',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Highlight this article in the featured spotlight on the home page and /articles.',
      },
    },
    {
      name: 'category',
      type: 'select',
      index: true,
      defaultValue: 'articles',
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
      admin: {
        position: 'sidebar',
        description:
          'Minutes ("{n} min"). Auto-calculated on save from the article body (~200 words/min); enter manually only for external link-out articles.',
      },
    },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'imageUrl', type: 'text' },
    {
      name: 'link',
      type: 'text',
      admin: {
        description: 'Optional external publication URL (LinkedIn, Medium, Dev.to, ...).',
      },
    },
  ],
}
