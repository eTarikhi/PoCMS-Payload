import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/portfolio/hooks'
import { orderField } from '../fields/order'

export const Skills: CollectionConfig = {
  slug: 'skills',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'group', 'value', 'color', 'order'],
  },
  defaultSort: 'order',
    access: {
        read: () => true,
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
    },
    {
      name: 'value',
      type: 'number',
      required: true,
      min: 0,
      max: 100,
      admin: { description: 'Proficiency, 0-100.' },
    },
    {
      name: 'color',
      type: 'select',
      required: true,
      defaultValue: 'primary',
      options: ['primary', 'secondary', 'success', 'info', 'warning', 'danger'],
      admin: { description: 'Bootstrap contextual color of the progress bar.' },
    },
  ],
}
