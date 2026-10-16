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
    description: 'Images and files used across the site. Alt text is required for accessibility.',
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'updatedAt'],
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
