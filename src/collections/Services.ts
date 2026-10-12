import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'
import { orderField } from '../fields/order'

export const Services: CollectionConfig = {
  slug: 'services',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    group: 'Portfolio',
    description: 'Service categories shown in the services section. Lower "order" values appear first.',
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
