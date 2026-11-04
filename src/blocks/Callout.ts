import type { Block } from 'payload'

export const CALLOUT_VARIANTS = [
  { label: 'Info', value: 'info' },
  { label: 'Tip', value: 'tip' },
  { label: 'Warning', value: 'warning' },
  { label: 'Danger', value: 'danger' },
] as const

export const CalloutBlock: Block = {
  slug: 'callout',
  interfaceName: 'CalloutBlockFields',
  labels: {
    singular: 'Callout',
    plural: 'Callouts',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'variant',
          type: 'select',
          required: true,
          defaultValue: 'info',
          options: [...CALLOUT_VARIANTS],
          admin: { width: '35%' },
        },
        {
          name: 'title',
          type: 'text',
          label: 'Title (optional)',
          admin: {
            width: '65%',
            placeholder: 'Key takeaway',
          },
        },
      ],
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Callout message rendered inside the highlighted box.',
      },
    },
  ],
}
