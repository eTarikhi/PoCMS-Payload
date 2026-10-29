import type { CollectionConfig } from 'payload'

import { draftContentAccess, hiddenWithout } from '@/access/roles'
import { articlePagePath, hasArticlePage } from '@/app/(frontend)/lib/article-page'
import { contentLexicalEditor } from '@/fields/richText'
import { enrichArticleStaticImageMetaBeforeChange } from '@/lib/staticImageMeta'

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
    beforeChange: [computeReadTimeBeforeChange, enrichArticleStaticImageMetaBeforeChange],
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
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'excerpt', type: 'textarea', required: true },
            {
              type: 'collapsible',
              label: 'Article Media & Preview',
              admin: {
                initCollapsed: false,
                description:
                  'Choose how lead media appears on /articles and /articles/[slug]: No picture, Single image preview, or Gallery view.',
              },
              fields: [
                {
                  name: 'mediaMode',
                  type: 'radio',
                  label: 'Media Preview Mode',
                  defaultValue: 'single',
                  options: [
                    { label: 'No picture', value: 'none' },
                    { label: 'Single image preview', value: 'single' },
                    { label: 'Gallery view', value: 'gallery' },
                  ],
                  admin: {
                    layout: 'horizontal',
                  },
                },
                {
                  name: 'mediaSource',
                  type: 'radio',
                  label: 'Image Source',
                  defaultValue: 'upload',
                  options: [
                    { label: 'Direct Upload / Media Library', value: 'upload' },
                    { label: 'Existing Image URL / Path', value: 'url' },
                  ],
                  admin: {
                    layout: 'horizontal',
                    condition: (_, siblingData) =>
                      (siblingData?.mediaMode ?? 'single') === 'single',
                  },
                },
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Uploaded Cover Image',
                  admin: {
                    condition: (_, siblingData) => {
                      if ((siblingData?.mediaMode ?? 'single') !== 'single') return false
                      const inferred =
                        siblingData?.mediaSource ??
                        (siblingData?.imageUrl && !siblingData?.image ? 'url' : 'upload')
                      return inferred === 'upload'
                    },
                  },
                },
                {
                  name: 'imageUrl',
                  type: 'text',
                  label: 'Existing Image URL or Public Path',
                  admin: {
                    placeholder: '/images/articles/1735708966846.webp',
                    description:
                      'Reference an already-uploaded image path (e.g. "/images/articles/1735708966846.webp") or Vercel Blob URL.',
                    condition: (_, siblingData) => {
                      if ((siblingData?.mediaMode ?? 'single') !== 'single') return false
                      const inferred =
                        siblingData?.mediaSource ??
                        (siblingData?.imageUrl && !siblingData?.image ? 'url' : 'upload')
                      return inferred === 'url'
                    },
                    components: {
                      afterInput: [
                        '/components/admin/fields/PublicImagePreview#PublicImagePreview',
                      ],
                    },
                  },
                },
                {
                  name: 'imageAlt',
                  type: 'text',
                  label: 'Cover Alt Text Override',
                  admin: {
                    placeholder: 'Descriptive alt text (falls back to Media alt or Article title)',
                    condition: (_, siblingData) =>
                      (siblingData?.mediaMode ?? 'single') === 'single',
                  },
                },
                {
                  name: 'imageUrlMeta',
                  type: 'json',
                  admin: { hidden: true },
                },
                {
                  name: 'galleryLayout',
                  type: 'select',
                  label: 'Gallery Display Style',
                  defaultValue: 'carousel',
                  options: [
                    { label: 'Interactive Carousel + Thumbnail Strip', value: 'carousel' },
                    { label: 'Editorial Grid + Lightbox', value: 'grid' },
                  ],
                  admin: {
                    width: '50%',
                    condition: (_, siblingData) => siblingData?.mediaMode === 'gallery',
                  },
                },
                {
                  name: 'gallery',
                  type: 'array',
                  label: 'Gallery Images',
                  maxRows: 20,
                  labels: {
                    singular: 'Gallery Image',
                    plural: 'Gallery Images',
                  },
                  admin: {
                    initCollapsed: false,
                    condition: (_, siblingData) => siblingData?.mediaMode === 'gallery',
                    description:
                      'Add slides via direct file upload or an already-uploaded image URL/path.',
                  },
                  fields: [
                    {
                      name: 'source',
                      type: 'radio',
                      label: 'Image Source',
                      defaultValue: 'upload',
                      options: [
                        { label: 'Direct Upload / Media Library', value: 'upload' },
                        { label: 'Existing Image URL / Path', value: 'url' },
                      ],
                      admin: { layout: 'horizontal' },
                    },
                    {
                      name: 'media',
                      type: 'upload',
                      relationTo: 'media',
                      admin: {
                        condition: (_, siblingData) => {
                          const inferred =
                            siblingData?.source ??
                            (siblingData?.imageUrl && !siblingData?.media ? 'url' : 'upload')
                          return inferred === 'upload'
                        },
                      },
                    },
                    {
                      name: 'imageUrl',
                      type: 'text',
                      label: 'Existing Image URL or Public Path',
                      admin: {
                        placeholder: '/images/articles/1735708966846.webp',
                        condition: (_, siblingData) => {
                          const inferred =
                            siblingData?.source ??
                            (siblingData?.imageUrl && !siblingData?.media ? 'url' : 'upload')
                          return inferred === 'url'
                        },
                        components: {
                          afterInput: [
                            '/components/admin/fields/PublicImagePreview#PublicImagePreview',
                          ],
                        },
                      },
                    },
                    {
                      type: 'row',
                      fields: [
                        {
                          name: 'caption',
                          type: 'text',
                          admin: {
                            width: '60%',
                            placeholder: 'Optional slide caption',
                          },
                        },
                        {
                          name: 'alt',
                          type: 'text',
                          admin: {
                            width: '40%',
                            placeholder: 'Alt text (overrides Media alt)',
                          },
                        },
                      ],
                    },
                    {
                      name: 'urlMeta',
                      type: 'json',
                      admin: { hidden: true },
                    },
                  ],
                },
              ],
            },
            {
              name: 'content',
              type: 'richText',
              label: 'Article Body',
              editor: contentLexicalEditor,
              admin: {
                description:
                  'Rich-text article body with headings (drives Table of Contents), Code, Callout, and resizable Media blocks. Leave empty if the article only links out externally.',
              },
            },
            {
              name: 'description',
              type: 'textarea',
              label: 'Legacy Plain-Text Body',
              admin: {
                condition: (_, siblingData) =>
                  Boolean(
                    typeof siblingData?.description === 'string' && siblingData.description.trim(),
                  ),
                description:
                  'Legacy plain-text body preserved from earlier versions. Prefer the Rich Text Article Body above.',
              },
            },
            {
              name: 'link',
              type: 'text',
              admin: {
                description: 'Optional external publication URL (LinkedIn, Medium, Dev.to, ...).',
              },
            },
          ],
        },
      ],
    },
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
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Highlight this article in the featured spotlight on the home page and /articles.',
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
  ],
}
