import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'
import { orderField } from '../fields/order'

export const Projects: CollectionConfig = {
  slug: 'projects',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('projects'),
    group: 'Content',
    description: 'Portfolio projects, listed under /projects.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', 'order'],
  },
  defaultSort: 'order',
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('projects'),
  fields: [
    orderField,
    { name: 'title', type: 'text', required: true },
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
        { name: 'url', type: 'text', admin: { description: 'Live site or case-study URL.' } },
        {
          name: 'readMoreUrl',
          type: 'text',
          admin: { description: 'URL for the "Read More" link.' },
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
  ],
}
