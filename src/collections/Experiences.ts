import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'
import { orderField } from '../fields/order'

export const Experiences: CollectionConfig = {
  slug: 'experiences',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  defaultSort: 'order',
  admin: {
    hidden: hiddenWithout('experiences'),
    group: 'Profile',
    description: 'Work history in the résumé section. Lower order shows first.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'company', 'date', 'order'],
  },
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('experiences'),
  fields: [
    orderField,
    { name: 'title', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'company', type: 'text', required: true },
        {
          name: 'date',
          type: 'text',
          required: true,
          admin: { description: 'Display text, e.g. "2019 - Present".' },
        },
      ],
    },
  ],
}
