import type { CollectionConfig } from 'payload'
import { orderField } from '../fields/order'

export const Services: CollectionConfig = {
  slug: 'services',
  admin: {
    useAsTitle: 'category',
    defaultColumns: ['category', 'iconFont', 'order'],
  },
  defaultSort: 'order',
  access: {
    read: () => true,
  },
  fields: [
    orderField,
    { name: 'category', type: 'text', required: true },
    {
      name: 'iconFont',
      type: 'text',
      admin: { description: 'Font Awesome icon name used by the frontend, e.g. faCode.' },
    },
    {
      name: 'descriptions',
      type: 'text',
      hasMany: true,
      required: true,
      admin: { description: 'One entry per bullet point.' },
    },
  ],
}
