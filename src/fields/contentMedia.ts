import type { Field } from 'payload'

export type PrimaryMediaCollapsibleOptions = {
  /** Human-readable context for help text (e.g. "article" or "project"). */
  entityLabel: 'article' | 'project'
  /** Example path placeholder for the URL input. */
  urlPlaceholder: string
  /** Include optional `thumbnailUrl` crop override (used on `Projects` cards). */
  includeThumbnailOverride?: boolean
}

export type DetailMediaCollapsibleOptions = {
  /** Route pattern shown in help text (e.g. "/articles/[slug]" or "/projects/[slug]"). */
  slugRouteExample: string
  /** Example path placeholder for item URL inputs. */
  urlPlaceholder: string
}

const inferSingleSource = (siblingData: Record<string, unknown> | undefined): 'upload' | 'url' => {
  const explicit = siblingData?.source
  if (explicit === 'upload' || explicit === 'url') return explicit
  return siblingData?.imageUrl && !siblingData?.media ? 'url' : 'upload'
}

/**
 * Primary Media Block (`primaryMedia` group):
 * Dedicated strictly to Home (`/`), `/articles`, and `/projects` directory cards.
 * Supports `"No picture"` (`none`) and `"Single Image View"` (`single`) only — never Gallery View.
 */
export function buildPrimaryMediaCollapsible({
  entityLabel,
  urlPlaceholder,
  includeThumbnailOverride = false,
}: PrimaryMediaCollapsibleOptions): Field {
  const listingPath = entityLabel === 'article' ? '/articles' : '/projects'

  const groupFields: Field[] = [
    {
      name: 'mode',
      type: 'radio',
      label: 'Primary Media Mode',
      defaultValue: 'single',
      options: [
        { label: 'No picture', value: 'none' },
        { label: 'Single Image View', value: 'single' },
      ],
      admin: {
        layout: 'horizontal',
      },
    },
    {
      name: 'source',
      type: 'radio',
      label: 'Image Source',
      defaultValue: 'upload',
      options: [
        { label: 'Direct Upload / Media Library', value: 'upload' },
        { label: 'Existing Image URL / Path', value: 'url' },
      ],
      admin: {
        layout: 'horizontal',
        condition: (_, siblingData) => (siblingData?.mode ?? 'single') === 'single',
      },
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      label: 'Uploaded Card Image',
      admin: {
        condition: (_, siblingData) => {
          if ((siblingData?.mode ?? 'single') !== 'single') return false
          return inferSingleSource(siblingData as Record<string, unknown> | undefined) === 'upload'
        },
      },
    },
    {
      name: 'imageUrl',
      type: 'text',
      label: 'Existing Image URL or Public Path',
      admin: {
        placeholder: urlPlaceholder,
        description:
          'Reference an already-uploaded image path (e.g. "/images/...") or Vercel Blob URL.',
        condition: (_, siblingData) => {
          if ((siblingData?.mode ?? 'single') !== 'single') return false
          return inferSingleSource(siblingData as Record<string, unknown> | undefined) === 'url'
        },
        components: {
          afterInput: ['/components/admin/fields/PublicImagePreview#PublicImagePreview'],
        },
      },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'Card Alt Text Override',
      admin: {
        placeholder: `Descriptive alt text (falls back to Media alt or ${entityLabel} title)`,
        condition: (_, siblingData) => (siblingData?.mode ?? 'single') === 'single',
      },
    },
    {
      name: 'urlMeta',
      type: 'json',
      admin: { hidden: true },
    },
  ]

  if (includeThumbnailOverride) {
    groupFields.push({
      name: 'thumbnailUrl',
      type: 'text',
      label: 'Card Thumbnail URL (Optional Crop Override)',
      admin: {
        placeholder: '/images/projects/thumb/SepiWhite.webp',
        description:
          'Optional compact thumbnail path for portfolio grid cards while keeping the full screenshot above for Showcase hover-pan.',
        condition: (_, siblingData) => (siblingData?.mode ?? 'single') === 'single',
        components: {
          afterInput: ['/components/admin/fields/PublicImagePreview#PublicImagePreview'],
        },
      },
    })
  }

  return {
    type: 'collapsible',
    label: 'Primary Media Block (Home & Directory Cards)',
    admin: {
      initCollapsed: false,
      description: `Controls featured card imagery on the home page (/) and ${listingPath} directory without affecting the slug detail page.`,
    },
    fields: [
      {
        name: 'primaryMedia',
        type: 'group',
        label: false,
        fields: groupFields,
      },
    ],
  }
}

/**
 * Detail Media Block (`detailMedia` group):
 * Dedicated strictly to individual `/articles/[slug]` and `/projects/[slug]` pages.
 * Defaults to `"Single Image View"` where Primary Media is automatically mapped to `items[0]`,
 * and supports `"Gallery View"` (`carousel` | `grid`) as well as `"No picture"`.
 */
export function buildDetailMediaCollapsible({
  slugRouteExample,
  urlPlaceholder,
}: DetailMediaCollapsibleOptions): Field {
  return {
    type: 'collapsible',
    label: 'Detail Media Block (Slug Detail Page)',
    admin: {
      initCollapsed: false,
      description: `Controls lead media strictly on ${slugRouteExample}. Defaults to Single Image View where Primary Media maps automatically to Item #1.`,
    },
    fields: [
      {
        name: 'detailMedia',
        type: 'group',
        label: false,
        fields: [
          {
            name: 'mode',
            type: 'radio',
            label: 'Detail Media Mode',
            defaultValue: 'single',
            options: [
              { label: 'No picture', value: 'none' },
              { label: 'Single Image View', value: 'single' },
              { label: 'Gallery View', value: 'gallery' },
            ],
            admin: {
              layout: 'horizontal',
            },
          },
          {
            name: 'galleryLayout',
            type: 'select',
            label: 'Gallery Display Style',
            defaultValue: 'carousel',
            options: [
              { label: 'Interactive Carousel + Thumbnail Strip', value: 'carousel' },
              { label: 'Editorial Grid + Lightbox', value: 'grid' },
            ],
            admin: {
              width: '50%',
              condition: (_, siblingData) => siblingData?.mode === 'gallery',
            },
          },
          {
            name: 'detailMediaSyncBar',
            type: 'ui',
            admin: {
              condition: (_, siblingData) => (siblingData?.mode ?? 'single') !== 'none',
              components: {
                Field: '/components/admin/fields/DetailMediaSyncBar#DetailMediaSyncBar',
              },
            },
          },
          {
            name: 'items',
            type: 'array',
            label: 'Detail Media Sequence',
            maxRows: 20,
            labels: {
              singular: 'Media Item',
              plural: 'Media Items',
            },
            admin: {
              initCollapsed: false,
              condition: (_, siblingData) => (siblingData?.mode ?? 'single') !== 'none',
              description:
                'Item #1 renders as the lead cover in Single Image View; all items render in sequence in Gallery View.',
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
                  condition: (_, siblingData) =>
                    inferSingleSource(siblingData as Record<string, unknown> | undefined) ===
                    'upload',
                },
              },
              {
                name: 'imageUrl',
                type: 'text',
                label: 'Existing Image URL or Public Path',
                admin: {
                  placeholder: urlPlaceholder,
                  condition: (_, siblingData) =>
                    inferSingleSource(siblingData as Record<string, unknown> | undefined) === 'url',
                  components: {
                    afterInput: ['/components/admin/fields/PublicImagePreview#PublicImagePreview'],
                  },
                },
              },
              {
                type: 'row',
                fields: [
                  {
                    name: 'caption',
                    type: 'text',
                    admin: {
                      width: '60%',
                      placeholder: 'Optional slide caption',
                    },
                  },
                  {
                    name: 'alt',
                    type: 'text',
                    admin: {
                      width: '40%',
                      placeholder: 'Alt text (overrides Media alt)',
                    },
                  },
                ],
              },
              {
                name: 'urlMeta',
                type: 'json',
                admin: { hidden: true },
              },
            ],
          },
        ],
      },
    ],
  }
}

const buildHiddenLegacyGalleryField = (): Field => ({
  name: 'gallery',
  type: 'array',
  maxRows: 20,
  admin: { hidden: true },
  fields: [
    {
      name: 'source',
      type: 'radio',
      options: [
        { label: 'Direct Upload / Media Library', value: 'upload' },
        { label: 'Existing Image URL / Path', value: 'url' },
      ],
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'imageUrl',
      type: 'text',
    },
    {
      name: 'caption',
      type: 'text',
    },
    {
      name: 'alt',
      type: 'text',
    },
    {
      name: 'urlMeta',
      type: 'json',
    },
  ],
})

/**
 * Preserves legacy root media columns on `Articles` as hidden fields for non-destructive
 * backward compatibility with existing database rows, seed scripts, and automated migrations.
 */
export function buildHiddenLegacyArticleMediaFields(): Field[] {
  return [
    {
      name: 'mediaMode',
      type: 'radio',
      options: [
        { label: 'No picture', value: 'none' },
        { label: 'Single image preview', value: 'single' },
        { label: 'Gallery view', value: 'gallery' },
      ],
      admin: { hidden: true },
    },
    {
      name: 'mediaSource',
      type: 'radio',
      options: [
        { label: 'Direct Upload / Media Library', value: 'upload' },
        { label: 'Existing Image URL / Path', value: 'url' },
      ],
      admin: { hidden: true },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { hidden: true },
    },
    {
      name: 'imageUrl',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'imageAlt',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'imageUrlMeta',
      type: 'json',
      admin: { hidden: true },
    },
    {
      name: 'galleryLayout',
      type: 'select',
      options: [
        { label: 'Interactive Carousel + Thumbnail Strip', value: 'carousel' },
        { label: 'Editorial Grid + Lightbox', value: 'grid' },
      ],
      admin: { hidden: true },
    },
    buildHiddenLegacyGalleryField(),
  ]
}

/**
 * Preserves legacy root media columns on `Projects` as hidden fields for non-destructive
 * backward compatibility with existing database rows, seed scripts, and automated migrations.
 */
export function buildHiddenLegacyProjectMediaFields(): Field[] {
  return [
    {
      name: 'mediaMode',
      type: 'radio',
      options: [
        { label: 'No picture', value: 'none' },
        { label: 'Single image preview', value: 'single' },
        { label: 'Gallery view', value: 'gallery' },
      ],
      admin: { hidden: true },
    },
    {
      name: 'mediaSource',
      type: 'radio',
      options: [
        { label: 'Direct Upload / Media Library', value: 'upload' },
        { label: 'Existing Image URL / Path', value: 'url' },
      ],
      admin: { hidden: true },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { hidden: true },
    },
    {
      name: 'src',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'imageAlt',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'srcMeta',
      type: 'json',
      admin: { hidden: true },
    },
    {
      name: 'galleryLayout',
      type: 'select',
      options: [
        { label: 'Interactive Carousel + Thumbnail Strip', value: 'carousel' },
        { label: 'Editorial Grid + Lightbox', value: 'grid' },
      ],
      admin: { hidden: true },
    },
    buildHiddenLegacyGalleryField(),
    {
      name: 'placeHolder',
      type: 'text',
      admin: { hidden: true },
    },
  ]
}
