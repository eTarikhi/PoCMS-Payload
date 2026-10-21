import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Skills: CollectionConfig = {
  slug: 'skills',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('skills'),
    group: 'Profile',
    description: 'Skill bars in the résumé section, grouped by category.',
    useAsTitle: 'label',
    defaultColumns: ['label', 'group', 'value', 'color'],
  },
  // Drag and drop ordering (experimental in Payload, P5.5 pilot). Payload adds a hidden `_order`
  // text field with a fractional index and a hook that appends new documents, so this collection
  // no longer carries the manual `order` number the other lists use.
  orderable: true,
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('skills'),
  fields: [
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
