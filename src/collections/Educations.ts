import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'
import { orderField } from '../fields/order'

export const Educations: CollectionConfig = {
  slug: 'educations',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('educations'),
    group: 'Profile',
    description: 'Education history in the résumé section. Lower order shows first.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'institution', 'date', 'order'],
  },
  defaultSort: 'order',
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('educations'),
  fields: [
    orderField,
    { name: 'title', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'institution', type: 'text', required: true },
        { name: 'location', type: 'text' },
      ],
    },
    {
      name: 'date',
      type: 'text',
      required: true,
      admin: { description: 'Display text, e.g. "2001 - 2007".' },
    },
  ],
}
