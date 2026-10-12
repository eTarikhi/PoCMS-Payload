import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Media: CollectionConfig = {
  slug: 'media',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    group: 'Content',
    description:
      'Images used across the portfolio. Always fill in the alt text — relationship pickers and accessibility both rely on it.',
    useAsTitle: 'alt',
    components: {
      beforeList: ['/admin/lists/ListSummary.tsx'],
    },
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
