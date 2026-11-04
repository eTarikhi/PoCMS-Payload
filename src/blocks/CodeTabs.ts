import type { Block } from 'payload'

import { CODE_LANGUAGE_OPTIONS } from './Code'

export const CodeTabsBlock: Block = {
  slug: 'codeTabs',
  interfaceName: 'CodeTabsBlockFields',
  labels: {
    singular: 'Code Tabs / Diff',
    plural: 'Code Tabs / Diff Blocks',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Group Title (optional)',
      admin: {
        placeholder: 'End-to-End Implementation',
      },
    },
    {
      name: 'tabs',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 8,
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'label',
              type: 'text',
              label: 'Tab Filename / Label',
              required: true,
              admin: {
                width: '40%',
                placeholder: 'src/schema.ts',
              },
            },
            {
              name: 'language',
              type: 'select',
              required: true,
              defaultValue: 'typescript',
              options: [...CODE_LANGUAGE_OPTIONS],
              admin: { width: '32%' },
            },
            {
              name: 'highlightLines',
              type: 'text',
              label: 'Highlight Lines',
              admin: {
                width: '28%',
                placeholder: '2, 5-7',
              },
            },
          ],
        },
        {
          name: 'code',
          type: 'code',
          required: true,
          admin: {
            language: 'typescript',
          },
        },
      ],
    },
  ],
}
