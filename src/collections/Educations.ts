import { trashOrAdmin } from '@/access/roles'
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
    group: 'Profile',
    description: 'Education history in the résumé section. Lower order shows first.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'institution', 'date', 'order'],
  },
  defaultSort: 'order',
  // Deleting moves documents to the trash (restorable); only admins delete permanently.
  trash: true,
  access: {
    read: () => true,
    delete: trashOrAdmin,
  },
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
