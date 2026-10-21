import { contentAccess, hiddenWithout } from '@/access/roles'
import { imageSourceField } from './imageSource'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Projects: CollectionConfig = {
  slug: 'projects',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('projects'),
    group: 'Content',
    description: 'Portfolio projects, listed under /projects.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories'],
  },
  // Drag and drop ordering (P5.5): Payload keeps the position in a hidden `_order` fractional index
  // and appends new documents, so the manual `order` number is gone. The list and the site read the
  // same key.
  orderable: true,
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('projects'),
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description:
          'URL key for /projects/{slug}. Made from the title when left empty. Keep it stable once the project is shared.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Used as the full image when the Image URL below is empty. It is also the thumbnail when the Place Holder Image URL is empty.',
        components: imageSourceField({
          urlField: 'src',
          urlLabel: 'External image URL',
          urlDescription:
            'Used only when no project image is chosen above. The Place Holder URL below is the card thumbnail.',
        }),
      },
    },
    {
      type: 'row',
      fields: [
        // Edited through the Image source control above; kept in the API and hidden in the form.
        { name: 'src', label: 'Image URL', type: 'text', admin: { hidden: true } },
        { name: 'placeHolder', label: 'Place Holder Image URL', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'url', type: 'text', admin: { description: 'Live site or case-study URL.' } },
        {
          name: 'readMoreUrl',
          type: 'text',
          admin: { description: 'URL for the "Read More" link.' },
        },
      ],
    },
    {
      name: 'categories',
      type: 'select',
      hasMany: true,
      required: true,
      options: [
        { label: 'Front-End', value: 'front-end' },
        { label: 'Back-End', value: 'back-end' },
        { label: 'CMS-CRM', value: 'cms-crm' },
      ],
      admin: { position: 'sidebar' },
    },
  ],
}
