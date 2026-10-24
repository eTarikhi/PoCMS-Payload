import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

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
    defaultColumns: ['category', 'iconFont'],
  },
  // Drag and drop ordering (P5.5): Payload keeps the position in a hidden `_order` fractional index
  // and appends new documents, so the manual `order` number is gone. The list and the site read the
  // same key.
  orderable: true,
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Saved views: store and share this list view's filters, columns and sort order.
  enableQueryPresets: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('services'),
  fields: [
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
