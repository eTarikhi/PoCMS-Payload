import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { homeSectionAfterChange, homeSectionAfterDelete } from '../app/(frontend)/lib/hooks'

export const Services: CollectionConfig = {
  slug: 'services',
  orderable: true,
  hooks: {
    afterChange: [homeSectionAfterChange],
    afterDelete: [homeSectionAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('services'),
    group: 'Profile',
    description: 'Service categories shown on the home page. Drag rows to reorder.',
    useAsTitle: 'category',
    defaultColumns: ['category', 'iconFont', 'updatedAt'],
  },
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
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
