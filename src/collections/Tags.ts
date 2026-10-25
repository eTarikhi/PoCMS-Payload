import type { CollectionConfig } from 'payload'
import { contentAccess, hiddenWithout } from '@/access/roles'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: { group: 'Content', hidden: hiddenWithout('articles'), useAsTitle: 'name', defaultColumns: ['name', 'slug'] },
  access: contentAccess('articles'),
  fields: [
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
  ],
}
