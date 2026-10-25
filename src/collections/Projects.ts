import type { CollectionConfig } from 'payload'

import { contentAccess, hiddenWithout } from '@/access/roles'
import { hasProjectPage, projectPagePath } from '@/app/(frontend)/lib/project-page'
import { contentLexicalEditor } from '@/fields/richText'

import {
  computeReadTimeBeforeChange,
  portfolioAfterChange,
  portfolioAfterDelete,
  projectSlugBeforeValidate,
} from '../app/(frontend)/lib/hooks'

export const Projects: CollectionConfig = {
  slug: 'projects',
  orderable: true,
  hooks: {
    beforeValidate: [projectSlugBeforeValidate],
    beforeChange: [computeReadTimeBeforeChange],
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('projects'),
    group: 'Content',
    description: 'Portfolio projects and case studies (/projects/{slug}). Drag rows to reorder.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', 'readTime', 'updatedAt'],
    livePreview: {
      url: ({ data }) => (hasProjectPage(data) ? projectPagePath(String(data.slug)) : null),
    },
    preview: (doc) => (hasProjectPage(doc) ? projectPagePath(String(doc.slug)) : null),
  },
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('projects'),
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'excerpt',
      type: 'textarea',
      admin: {
        description: 'Short overview shown at the top of the case study and in SEO metadata.',
      },
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
      name: 'content',
      type: 'richText',
      label: 'Case Study Body',
      editor: contentLexicalEditor,
      admin: {
        description:
          'Rich-text case study with headings (Table of Contents), Code, Callout, and Media blocks. Leave empty when the project only links out externally.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Used as the full image when the Image URL below is empty. It is also the thumbnail when the Place Holder Image URL is empty.',
      },
    },
    {
      type: 'row',
      fields: [
        { name: 'src', label: 'Image URL', type: 'text' },
        { name: 'placeHolder', label: 'Place Holder Image URL', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'url', type: 'text', admin: { description: 'Live site or external project URL.' } },
        {
          name: 'readMoreUrl',
          type: 'text',
          admin: { description: 'Optional secondary external link (repository or announcement).' },
        },
      ],
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
