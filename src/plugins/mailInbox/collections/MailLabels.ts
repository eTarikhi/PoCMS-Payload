import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { capabilityAccess } from '@/access/roles'

import { MAIL_LABELS_COLLECTION } from '../constants'

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

const slugifyLabel = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeMailLabelHook: CollectionBeforeValidateHook = ({ data }) => {
  if (!data || typeof data !== 'object') return data
  const rec = data as Record<string, unknown>

  const name = typeof rec.name === 'string' ? rec.name.trim() : ''
  if (name) rec.name = name

  const rawSlug = typeof rec.slug === 'string' ? rec.slug.trim() : ''
  if (!rawSlug && name) {
    rec.slug = slugifyLabel(name)
  } else if (rawSlug) {
    rec.slug = slugifyLabel(rawSlug)
  }

  const rawColor = typeof rec.color === 'string' ? rec.color.trim().toUpperCase() : ''
  rec.color = HEX_COLOR_RE.test(rawColor) ? rawColor : '#3B82F6'

  return data
}

export function createMailLabelsCollection(): CollectionConfig {
  return {
    slug: MAIL_LABELS_COLLECTION,
    labels: {
      singular: 'Mail label',
      plural: 'Mail labels',
    },
    custom: {
      permissions: false,
      tanstackList: false,
      listSummary: false,
      graphqlTab: false,
    },
    admin: {
      group: 'Admin',
      hidden: true,
      useAsTitle: 'name',
      defaultColumns: ['name', 'slug', 'color', 'isSystem'],
    },
    access: {
      read: capabilityAccess('manageInbox'),
      create: capabilityAccess('manageInbox'),
      update: capabilityAccess('manageInbox'),
      delete: capabilityAccess('manageInbox'),
    },
    hooks: {
      beforeValidate: [normalizeMailLabelHook],
    },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
      },
      {
        name: 'slug',
        type: 'text',
        required: true,
        unique: true,
        index: true,
      },
      {
        name: 'color',
        type: 'text',
        required: true,
        defaultValue: '#3B82F6',
        validate: (value: string | null | undefined) => {
          if (!value || !HEX_COLOR_RE.test(value)) {
            return 'Color must be a 6-digit hex code such as #3B82F6.'
          }
          return true
        },
      },
      {
        name: 'description',
        type: 'text',
      },
      {
        name: 'isSystem',
        type: 'checkbox',
        defaultValue: false,
      },
    ],
  }
}
