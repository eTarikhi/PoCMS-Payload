import type { CollectionConfig } from 'payload'

export const Header: CollectionConfig = {
  slug: 'header',
  labels: {
    singular: 'Header',
    plural: 'Header',
  },
  admin: {
    useAsTitle: 'sureName',
    defaultColumns: ['id', 'sureName', 'professionTexts', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'sureName', type: 'text', required: true },
    { name: 'profileImage', type: 'upload', relationTo: 'media' },
    { name: 'imageUrl', type: 'text' },
    {
      name: 'requestCV',
      type: 'text',
      admin: { description: 'Link behind the "Request CV" button.' },
    },
    {
      name: 'professionTexts',
      type: 'text',
      hasMany: true,
      required: true,
      admin: { description: 'Job titles shown in the hero section.' },
    },
  ],
}
