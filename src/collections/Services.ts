import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../lib/portfolio/hooks'
import { orderField } from '../fields/order'

export const Services: CollectionConfig = {
  slug: 'services',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
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
      type: 'select',
      options: ['faCode', 'faCropAlt', 'faLaptopCode', 'faCodeBranch'],
      admin: { description: 'Icon shown next to the category. Only the icons the frontend has are listed.' },
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
