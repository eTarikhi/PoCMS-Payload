import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Certificates: CollectionConfig = {
  slug: 'certificates',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'issuer', 'issuedAt'],
  },
  defaultSort: 'issuedAt',
  access: {
    read: () => true,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'issuer', type: 'text', required: true },
    {
      name: 'issuedAt',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'MMMM d, yyyy' } },
    },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'imageUrl', type: 'text' },
    { name: 'link', type: 'text', admin: { description: 'Public credential URL.' } },
  ],
}
