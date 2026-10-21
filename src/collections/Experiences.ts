import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Experiences: CollectionConfig = {
  slug: 'experiences',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('experiences'),
    group: 'Profile',
    description: 'Work history in the résumé section. Drag to reorder in the list.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'company', 'date'],
  },
  // Drag and drop ordering (P5.5): Payload keeps the position in a hidden `_order` fractional index
  // and appends new documents, so the manual `order` number is gone. The list and the site read the
  // same key.
  orderable: true,
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('experiences'),
  fields: [
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
