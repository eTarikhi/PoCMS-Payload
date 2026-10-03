import type { CollectionConfig } from 'payload'
import { orderField } from '../fields/order'

export const Projects: CollectionConfig = {
  slug: 'projects',
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
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'The thumbnail is generated automatically (media.sizes.thumbnail).' },
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
