import type { Block } from 'payload'

export const MediaBlock: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlockFields',
  labels: {
    singular: 'Media',
    plural: 'Media Blocks',
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Uploaded image from the Media library.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'imageUrl',
          type: 'text',
          label: 'Fallback Image URL',
          admin: {
            width: '65%',
            description: 'Used when no uploaded Media item is selected above.',
          },
        },
        {
          name: 'size',
          type: 'select',
          defaultValue: 'normal',
          options: [
            { label: 'Standard column', value: 'normal' },
            { label: 'Wide breakout', value: 'wide' },
          ],
          admin: { width: '35%' },
        },
      ],
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        placeholder: 'Optional figure caption',
      },
    },
  ],
}
