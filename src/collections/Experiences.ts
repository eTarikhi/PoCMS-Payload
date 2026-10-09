import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/portfolio/hooks'
import { orderField } from '../fields/order'

export const Experiences: CollectionConfig = {
  slug: 'experiences',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  defaultSort: 'order',
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
