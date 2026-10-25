import type { CollectionConfig } from 'payload'
import { contentAccess, hiddenWithout } from '@/access/roles'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: { group: 'Content', hidden: hiddenWithout('articles'), useAsTitle: 'name', defaultColumns: ['name', 'slug'] },
  access: contentAccess('articles'),
  fields: [
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
  ],
}
