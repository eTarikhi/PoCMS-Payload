import type { Block } from 'payload'

export const MetricsBlock: Block = {
  slug: 'metrics',
  interfaceName: 'MetricsBlockFields',
  labels: {
    singular: 'Impact / KPI Metrics',
    plural: 'Impact / KPI Metrics Blocks',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      label: 'Section Heading (optional)',
      admin: {
        placeholder: 'Measured Production Impact',
      },
    },
    {
      name: 'items',
      type: 'array',
      label: 'KPI Cards',
      required: true,
      minRows: 1,
      maxRows: 6,
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'value',
              type: 'text',
              required: true,
              admin: {
                width: '32%',
                placeholder: '+140%',
              },
            },
            {
              name: 'label',
              type: 'text',
              required: true,
              admin: {
                width: '40%',
                placeholder: 'Throughput',
              },
            },
            {
              name: 'tone',
              type: 'select',
              defaultValue: 'gold',
              options: [
                { label: 'Burnished Gold', value: 'gold' },
                { label: 'Emerald Positive', value: 'emerald' },
                { label: 'Slate Cyan', value: 'cyan' },
                { label: 'Neutral Slate', value: 'slate' },
              ],
              admin: { width: '28%' },
            },
          ],
        },
        {
          name: 'context',
          type: 'text',
          label: 'Supporting Context (optional)',
          admin: {
            placeholder: 'p99 < 38ms across regional edge PoPs',
          },
        },
      ],
    },
  ],
}
