import { contentAccess, hiddenWithout } from '@/access/roles'
import type { CollectionConfig } from 'payload'
import { portfolioAfterChange, portfolioAfterDelete } from '../app/(frontend)/lib/hooks'

export const Media: CollectionConfig = {
  slug: 'media',
  hooks: {
    afterChange: [portfolioAfterChange],
    afterDelete: [portfolioAfterDelete],
  },
  admin: {
    hidden: hiddenWithout('media'),
    group: 'Content',
    description: 'Images and files used across the site. Alt text is required for accessibility.',
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'updatedAt'],
  },
  // Folders (beta in Payload 3.90): group images by where they are used. Payload adds a hidden
  // `folder` relationship and a `payload-folders` collection, and the admin gets the folder browser
  // at /admin/browse-by-folder.
  folders: true,
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
    // Images first: every size below is generated with sharp. PDFs are allowed for documents such
    // as a CV; Payload skips resizing them and keeps the original.
    mimeTypes: ['image/*', 'application/pdf'],
    // The editor picks the point that matters in the picture (a face, a logo) and every crop below
    // keeps it in frame. Sizes without an explicit `position` crop around the focal point; the
    // default is the centre, which is what the sizes did before.
    focalPoint: true,
    imageSizes: [
      // Admin lists, drawers and relationship pickers. Never served to the public site.
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      // Article and project cards: 8:5, the aspect the card components reserve.
      { name: 'card', width: 800, height: 500 },
      // Open Graph / Twitter cards. 1200x630 is the size every scraper documents.
      { name: 'og', width: 1200, height: 630 },
    ],
    // Files uploaded before a size existed have no thumbnail: fall back to the original.
    adminThumbnail: ({ doc }) => {
      const sizes = doc.sizes as { thumbnail?: { url?: string | null } } | undefined
      return sizes?.thumbnail?.url || (typeof doc.url === 'string' ? doc.url : null)
    },
  },
}
