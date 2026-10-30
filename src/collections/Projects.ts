import type { CollectionConfig } from 'payload'

import { draftContentAccess, hiddenWithout } from '@/access/roles'
import { hasProjectPage, projectPagePath } from '@/app/(frontend)/lib/project-page'
import { contentLexicalEditor } from '@/fields/richText'
import { enrichProjectStaticImageMetaBeforeChange } from '@/lib/staticImageMeta'

import {
  computeReadTimeBeforeChange,
  projectAfterChange,
  projectAfterDelete,
  projectSlugBeforeValidate,
} from '../app/(frontend)/lib/hooks'

export const Projects: CollectionConfig = {
  slug: 'projects',
  orderable: true,
  versions: {
    maxPerDoc: 25,
    drafts: {
      autosave: { interval: 1000 },
      schedulePublish: true,
    },
  },
  hooks: {
    beforeValidate: [projectSlugBeforeValidate],
    beforeChange: [computeReadTimeBeforeChange, enrichProjectStaticImageMetaBeforeChange],
    afterChange: [projectAfterChange],
    afterDelete: [projectAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('projects'),
    group: 'Content',
    description: 'Portfolio projects and case studies (/projects/{slug}). Drag rows to reorder.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', '_status', 'readTime', 'updatedAt'],
    livePreview: {
      url: ({ data }) => (hasProjectPage(data) ? projectPagePath(String(data.slug)) : null),
    },
    preview: (doc) =>
      hasProjectPage(doc)
        ? `/api/draft?collection=projects&slug=${encodeURIComponent(String(doc.slug))}`
        : null,
  },
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Public visitors read published (or legacy pre-draft) projects; signed-in editors also read drafts & versions.
  access: draftContentAccess('projects'),
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'title', type: 'text', required: true },
            {
              name: 'excerpt',
              type: 'textarea',
              admin: {
                description:
                  'Short overview shown at the top of the case study and in SEO metadata.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'role',
                  type: 'text',
                  admin: { width: '40%', placeholder: 'Lead Full-Stack Developer' },
                },
                {
                  name: 'client',
                  type: 'text',
                  admin: { width: '35%', placeholder: 'Client or company' },
                },
                {
                  name: 'year',
                  type: 'text',
                  admin: { width: '25%', placeholder: '2025' },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Case Study Media & Card Preview',
              admin: {
                initCollapsed: false,
                description:
                  'Choose how lead media appears on /projects/[slug]: No picture, Single image preview, or Gallery view. Portfolio card thumbnails remain configurable below.',
              },
              fields: [
                {
                  name: 'mediaMode',
                  type: 'radio',
                  label: 'Case Study Media Preview Mode',
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
                  label: 'Uploaded Case Study Image',
                  admin: {
                    description:
                      'Used as the case-study cover image and as the portfolio card thumbnail when no Card Thumbnail URL override is set below.',
                    condition: (_, siblingData) => {
                      if ((siblingData?.mediaMode ?? 'single') !== 'single') return false
                      const inferred =
                        siblingData?.mediaSource ??
                        (siblingData?.src && !siblingData?.image ? 'url' : 'upload')
                      return inferred === 'upload'
                    },
                  },
                },
                {
                  name: 'src',
                  label: 'Existing Image URL or Public Path',
                  type: 'text',
                  admin: {
                    placeholder: '/images/projects/portfolio-preview.webp',
                    description:
                      'Reference an already-uploaded image path (e.g. "/images/projects/...") or Vercel Blob URL.',
                    condition: (_, siblingData) => {
                      if ((siblingData?.mediaMode ?? 'single') !== 'single') return false
                      const inferred =
                        siblingData?.mediaSource ??
                        (siblingData?.src && !siblingData?.image ? 'url' : 'upload')
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
                    placeholder: 'Descriptive alt text (falls back to Media alt or Project title)',
                    condition: (_, siblingData) =>
                      (siblingData?.mediaMode ?? 'single') === 'single',
                  },
                },
                {
                  name: 'srcMeta',
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
                      'Add case-study screenshots or architecture slides via direct upload or an already-uploaded image URL/path.',
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
                        placeholder: '/images/projects/portfolio-preview.webp',
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
                {
                  name: 'placeHolder',
                  label: 'Portfolio Card Thumbnail URL (Optional Override)',
                  type: 'text',
                  admin: {
                    placeholder: '/images/projects/thumb.webp',
                    description:
                      'Optional dedicated thumbnail path for portfolio grid cards (preserves home-page card appearance even when case-study preview mode is No picture or Gallery).',
                    components: {
                      afterInput: [
                        '/components/admin/fields/PublicImagePreview#PublicImagePreview',
                      ],
                    },
                  },
                },
              ],
            },
            {
              name: 'content',
              type: 'richText',
              label: 'Case Study Body',
              editor: contentLexicalEditor,
              admin: {
                description:
                  'Rich-text case study with headings (Table of Contents), Code, Callout, and resizable Media blocks. Leave empty when the project only links out externally.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'url',
                  type: 'text',
                  admin: { description: 'Live site or external project URL.' },
                },
                {
                  name: 'readMoreUrl',
                  type: 'text',
                  admin: {
                    description: 'Optional secondary external link (repository or announcement).',
                  },
                },
              ],
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
          'URL key for /projects/{slug}. Made from the title when left empty. Keep it stable once the project is shared.',
      },
    },
    {
      name: 'categories',
      type: 'select',
      hasMany: true,
      required: true,
      options: [
        { label: 'Front-End', value: 'front-end' },
        { label: 'Back-End', value: 'back-end' },
        { label: 'CMS-CRM', value: 'cms-crm' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'techStack',
      type: 'text',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description: 'Technologies used (e.g. Next.js, Payload CMS, PostgreSQL).',
      },
    },
    {
      name: 'readTime',
      type: 'number',
      min: 1,
      admin: {
        position: 'sidebar',
        description: 'Minutes ("{n} min"). Auto-calculated on save from the case-study body.',
      },
    },
  ],
}
