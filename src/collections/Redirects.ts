import type { CollectionConfig } from 'payload'

import { contentAccess, hiddenWithout } from '@/access/roles'
import { can } from '@/access/permissions'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: {
    hidden: hiddenWithout('articles'),
    group: 'Content',
    useAsTitle: 'from',
    defaultColumns: ['from', 'to', 'statusCode', 'updatedAt'],
    description: 'Permanent and temporary redirects, including automatically preserved slug history.',
  },
  access: {
    ...contentAccess('articles'),
    read: ({ req }) => Boolean(req.user && can(req.user, 'articles', 'read')),
  },
  fields: [
    { name: 'from', type: 'text', required: true, unique: true, index: true },
    { name: 'to', type: 'text', required: true },
    { name: 'statusCode', type: 'select', required: true, defaultValue: 301, options: [{ label: '301 Permanent', value: 301 }, { label: '302 Temporary', value: 302 }] },
    { name: 'source', type: 'select', defaultValue: 'manual', options: [{ label: 'Manual', value: 'manual' }, { label: 'Slug history', value: 'slug-history' }] },
  ],
}
