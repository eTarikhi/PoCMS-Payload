import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'
import { createWhileEmpty } from '../access/singleton'

export const Header: CollectionConfig = {
  slug: 'header',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  labels: {
    singular: 'Header',
    plural: 'Header',
  },
  admin: {
    group: 'Site settings',
    description:
      'The hero section: name, job titles and CV link. One document: the site shows the first one.',
    useAsTitle: 'sureName',
    defaultColumns: ['id', 'sureName', 'professionTexts', 'updatedAt'],
    // One-document collection: the list view opens the document (or the create form).
    components: {
      views: { list: { Component: '/components/admin/views/SingletonList#SingletonListView' } },
    },
  },
  access: {
    read: () => true,
    create: createWhileEmpty('header'),
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
