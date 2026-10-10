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
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', 'order'],
  },
  defaultSort: 'order',
  access: {
    read: () => true,
  },
  fields: [
    orderField,
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        description: 'URL key for /projects/{slug}. Made from the title when left empty. Keep it stable once the project is shared.',
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
    { name: 'src', label: 'Image URL', type: 'text' },
    { name: 'placeHolder', label: 'Place Holder Image URL', type: 'text' },
    { name: 'url', type: 'text', admin: { description: 'Live site or case-study URL.' } },
    { name: 'readMoreUrl', type: 'text', admin: { description: 'URL for the "Read More" link.' } },
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
    },
  ],
}
