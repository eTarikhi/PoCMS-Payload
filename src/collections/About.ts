import type { CollectionConfig } from 'payload'
import { homeSectionAfterChange, homeSectionAfterDelete } from '../app/(frontend)/lib/hooks'
import { contentAccess, hiddenWithout } from '../access/roles'
import { createWhileEmpty } from '../access/singleton'

export const About: CollectionConfig = {
  slug: 'about',
  hooks: {
    afterChange: [homeSectionAfterChange],
    afterDelete: [homeSectionAfterDelete],
  },
  labels: {
    singular: 'About',
    plural: 'About',
  },
  admin: {
    hidden: hiddenWithout('about'),
    group: 'Profile',
    description: 'The About section. One document: the site shows the first one.',
    useAsTitle: 'title',
    defaultColumns: ['id', 'title', 'experience.years', 'updatedAt'],
    // One-document collection: the list view opens the document (or the create form).
    components: {
      views: { list: { Component: '/components/admin/views/SingletonList#SingletonListView' } },
    },
  },
  access: {
    ...contentAccess('about'),
    create: createWhileEmpty('about'),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'experience',
      type: 'group',
      fields: [
        { name: 'years', type: 'number', required: true, min: 0 },
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea', required: true },
      ],
    },
    {
      name: 'workPermit',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea', required: true },
      ],
    },
    {
      name: 'uploadImages',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
    },
    {
      name: 'images',
      label: 'Images URLs',
      type: 'array',
      fields: [{ name: 'imageUrl', type: 'text', required: true }],
    },
    {
      name: 'interests',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea', required: true },
        {
          name: 'areas',
          type: 'text',
          hasMany: true,
        },
      ],
    },
  ],
}
