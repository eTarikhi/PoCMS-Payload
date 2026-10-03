import type { CollectionConfig } from 'payload'
import { orderField } from '../fields/order'

export const Educations: CollectionConfig = {
  slug: 'educations',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'institution', 'date', 'order'],
  },
  defaultSort: 'order',
  access: {
    read: () => true,
  },
  fields: [
    orderField,
    { name: 'title', type: 'text', required: true },
    { name: 'institution', type: 'text', required: true },
    { name: 'location', type: 'text' },
    {
      name: 'date',
      type: 'text',
      required: true,
      admin: { description: 'Display text, e.g. "2001 - 2007".' },
    },
  ],
}
