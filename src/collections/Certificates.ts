import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Certificates: CollectionConfig = {
  slug: 'certificates',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('certificates'),
    group: 'Profile',
    description: 'Certificates and credentials.',
    useAsTitle: 'title',
    defaultColumns: ['title', 'issuer', 'issuedAt'],
  },
  defaultSort: 'issuedAt',
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Saved views: store and share this list view's filters, columns and sort order.
  enableQueryPresets: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('certificates'),
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'issuer', type: 'text', required: true },
    {
      name: 'issuedAt',
      type: 'date',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'MMMM d, yyyy' },
      },
    },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'imageUrl', type: 'text' },
    { name: 'link', type: 'text', admin: { description: 'Public credential URL.' } },
  ],
}
