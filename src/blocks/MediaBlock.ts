import type { Block, Field } from 'payload'

/**
 * Shared dimension, alignment, aspect-ratio, and caption controls reused by both `MediaBlock`
 * (`/media` block with interactive canvas resizer) and Lexical's `UploadFeature` (drag-and-drop).
 */
export const mediaDimensionFields: Field[] = [
  {
    type: 'row',
    fields: [
      {
        name: 'size',
        type: 'select',
        label: 'Display Size',
        defaultValue: 'normal',
        options: [
          { label: 'Small (40%)', value: 'small' },
          { label: 'Medium (65%)', value: 'medium' },
          { label: 'Full Column (100%)', value: 'normal' },
          { label: 'Wide', value: 'wide' },
          { label: 'Custom Width (px)', value: 'custom' },
        ],
        admin: { width: '34%' },
      },
      {
        name: 'customWidth',
        type: 'number',
        label: 'Custom Width (px)',
        min: 180,
        max: 1140,
        admin: {
          width: '33%',
          placeholder: 'e.g. 560',
          condition: (_, siblingData) => siblingData?.size === 'custom',
        },
      },
      {
        name: 'alignment',
        type: 'select',
        label: 'Alignment',
        defaultValue: 'center',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
        admin: { width: '33%' },
      },
    ],
  },
  {
    type: 'row',
    fields: [
      {
        name: 'aspectRatio',
        type: 'select',
        label: 'Aspect Ratio',
        defaultValue: 'auto',
        options: [
          { label: 'Original Ratio', value: 'auto' },
          { label: '16:9 Widescreen', value: '16:9' },
          { label: '4:3 Standard', value: '4:3' },
          { label: '1:1 Square', value: '1:1' },
        ],
        admin: { width: '40%' },
      },
      {
        name: 'alt',
        type: 'text',
        label: 'Alt Text Override',
        admin: {
          width: '60%',
          placeholder: 'Descriptive alt text (falls back to Media alt)',
        },
      },
    ],
  },
  {
    name: 'caption',
    type: 'text',
    admin: {
      placeholder: 'Optional figure caption',
    },
  },
]

export const MediaBlock: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlockFields',
  labels: {
    singular: 'Media / Image',
    plural: 'Media Blocks',
  },
  admin: {
    components: {
      Block: '/components/admin/lexical/MediaBlockEditor#MediaBlockEditor',
    },
  },
  fields: [
    {
      name: 'source',
      type: 'radio',
      label: 'Image Source',
      defaultValue: 'upload',
      options: [
        { label: 'Direct Upload / Media Library', value: 'upload' },
        { label: 'Existing Image URL / Path', value: 'url' },
      ],
      admin: { layout: 'horizontal' },
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Uploaded image from the Media library.',
        condition: (_, siblingData) => {
          const inferred =
            siblingData?.source ??
            (siblingData?.imageUrl && !siblingData?.media ? 'url' : 'upload')
          return inferred === 'upload'
        },
      },
    },
    {
      name: 'imageUrl',
      type: 'text',
      label: 'Existing Image URL or Public Path',
      admin: {
        placeholder: '/images/articles/1735708966846.webp',
        description:
          'Reference an already-uploaded image path (e.g. "/images/articles/1735708966846.webp") or Vercel Blob URL.',
        condition: (_, siblingData) => {
          const inferred =
            siblingData?.source ??
            (siblingData?.imageUrl && !siblingData?.media ? 'url' : 'upload')
          return inferred === 'url'
        },
        components: {
          afterInput: ['/components/admin/fields/PublicImagePreview#PublicImagePreview'],
        },
      },
    },
    ...mediaDimensionFields,
    {
      name: 'urlMeta',
      type: 'json',
      admin: { hidden: true },
    },
  ],
}
