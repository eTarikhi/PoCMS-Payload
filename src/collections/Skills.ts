import { trashOrAdmin } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'
import { orderField } from '../fields/order'

export const Skills: CollectionConfig = {
  slug: 'skills',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    group: 'Profile',
    description: 'Skill bars in the résumé section, grouped by category.',
    useAsTitle: 'label',
    defaultColumns: ['label', 'group', 'value', 'color', 'order'],
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
    { name: 'label', type: 'text', required: true },
    {
      name: 'group',
      type: 'select',
      required: true,
      defaultValue: 'frontend',
      index: true,
      options: [
        { label: 'Front-End', value: 'frontend' },
        { label: 'Back-End', value: 'backend' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'value',
      type: 'number',
      required: true,
      min: 0,
      max: 100,
      admin: {
        description: 'Proficiency, 0-100.',
        components: { Cell: '/components/admin/fields/Progress/Cell#ProgressCell' },
      },
    },
    {
      name: 'color',
      type: 'select',
      required: true,
      defaultValue: 'primary',
      options: ['primary', 'secondary', 'success', 'info', 'warning', 'danger'],
      admin: {
        description: 'Bootstrap contextual color of the progress bar.',
        components: {
          Field: '/components/admin/fields/ContextColor/Field#ContextColorField',
          Cell: '/components/admin/fields/ContextColor/Cell#ContextColorCell',
        },
      },
    },
  ],
}
