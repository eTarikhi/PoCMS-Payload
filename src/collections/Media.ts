import { trashOrAdmin } from '@/access/roles'
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
  // Saved views (filters and columns) in the list, see queryPresets in payload.config.ts.
  enableQueryPresets: true,
  // Deleting moves documents to the trash (restorable); only admins delete permanently.
  trash: true,
  access: {
    read: () => true,
    delete: trashOrAdmin,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    // Merged into Payload's built-in upload field of the same name: only the list cell changes.
    {
      name: 'filesize',
      type: 'number',
      // Without a label here, the merged field would get the generated label "Filesize".
      label: ({ t }) => t('upload:fileSize'),
      admin: { components: { Cell: '/components/admin/list/cells/FileSizeCell#FileSizeCell' } },
    },
  ],
  upload: {
    // A small version for admin lists, drawers and pickers; the site keeps using the original.
    imageSizes: [{ name: 'thumbnail', width: 400, height: 300, position: 'centre' }],
    // Files uploaded before the size existed have no thumbnail: fall back to the original.
    adminThumbnail: ({ doc }) => {
      const sizes = doc.sizes as { thumbnail?: { url?: string | null } } | undefined
      return sizes?.thumbnail?.url || (typeof doc.url === 'string' ? doc.url : null)
    },
  },
}
