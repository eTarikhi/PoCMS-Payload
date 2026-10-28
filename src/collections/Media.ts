import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Media: CollectionConfig = {
  slug: 'media',
  folders: true,
  enableQueryPresets: true,
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('media'),
    group: 'Content',
    description:
      'Images and files used across the site. Supports folders, focal-point cropping, and automatic WebP variants.',
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'updatedAt'],
  },
  // Deleting moves documents to the trash (restorable); deleting for good needs the Full level.
  trash: true,
  // Levels from the user's roles (ADR 0011): public read, edit and trash, full to delete for good.
  access: contentAccess('media'),
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
      admin: { components: { Cell: '/components/admin/fields/FileSize/Cell#FileSizeCell' } },
    },
  ],
  upload: {
    focalPoint: true,
    crop: true,
    formatOptions: {
      format: 'webp',
      options: { quality: 84 },
    },
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
        withoutEnlargement: true,
        formatOptions: {
          format: 'webp',
          options: { quality: 80 },
        },
        admin: {
          disableGroupBy: true,
          disableListColumn: true,
          disableListFilter: true,
        },
      },
      {
        name: 'card',
        width: 800,
        height: 520,
        position: 'centre',
        withoutEnlargement: true,
        formatOptions: {
          format: 'webp',
          options: { quality: 82 },
        },
        admin: {
          disableGroupBy: true,
          disableListColumn: true,
          disableListFilter: true,
        },
      },
      {
        name: 'hero',
        width: 1600,
        withoutEnlargement: true,
        formatOptions: {
          format: 'webp',
          options: { quality: 85 },
        },
        admin: {
          disableGroupBy: true,
          disableListColumn: true,
          disableListFilter: true,
        },
      },
    ],
    // Files uploaded before the size existed have no thumbnail: fall back to card or original.
    adminThumbnail: ({ doc }) => {
      const sizes = doc.sizes as
        | {
            thumbnail?: { url?: string | null }
            card?: { url?: string | null }
          }
        | undefined
      return (
        sizes?.thumbnail?.url ||
        sizes?.card?.url ||
        (typeof doc.url === 'string' ? doc.url : null)
      )
    },
  },
}
