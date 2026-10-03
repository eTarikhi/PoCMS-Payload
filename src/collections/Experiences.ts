import type { CollectionConfig } from 'payload'
import { orderField } from '../fields/order'

export const Experiences: CollectionConfig = {
  slug: 'experiences',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'company', 'date', 'order'],
  },
  access: {
    read: () => true,
  },
  fields: [
    orderField,
    { name: 'title', type: 'text', required: true },
    { name: 'date', type: 'text', required: true },
    { name: 'company', type: 'text', required: true },
  ],
}
