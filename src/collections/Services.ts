import { contentAccess, hiddenWithout } from '@/access/roles'
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
    hidden: hiddenWithout('services'),
    group: 'Profile',
    description: 'Service categories shown on the home page.',
    useAsTitle: 'category',
    defaultColumns: ['category', 'iconFont', 'order'],
  },
  defaultSort: 'order',
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('services'),
  fields: [
    orderField,
    { name: 'category', type: 'text', required: true },
    {
      name: 'iconFont',
      type: 'select',
      options: ['faCode', 'faCropAlt', 'faLaptopCode', 'faCodeBranch'],
      admin: {
        description: 'Icon shown next to the category. Only the icons the site has are listed.',
        components: {
          Field: '/components/admin/fields/ServiceIcon/Field#ServiceIconField',
          Cell: '/components/admin/fields/ServiceIcon/Cell#IconCell',
        },
      },
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
