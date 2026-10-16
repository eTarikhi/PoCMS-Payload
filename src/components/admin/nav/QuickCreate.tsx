import type { ServerProps } from 'payload'
import React from 'react'

import { QuickCreateMenu, type QuickCreateItem } from './QuickCreateMenu'

/** Collections offered in the sidebar "Create" menu, in display order. */
const QUICK_CREATE: { slug: string; label: string; icon: QuickCreateItem['icon'] }[] = [
  { slug: 'articles', label: 'Article', icon: 'article' },
  { slug: 'projects', label: 'Project', icon: 'project' },
  { slug: 'media', label: 'Upload media', icon: 'media' },
  { slug: 'experiences', label: 'Experience', icon: 'experience' },
  { slug: 'certificates', label: 'Certificate', icon: 'certificate' },
]

/**
 * `admin.components.beforeNavLinks`: a "Create" menu at the top of the sidebar. Only collections
 * the signed-in user may create are listed (Payload's computed permissions), so editors and admins
 * each see what they can actually do.
 */
export function QuickCreate({ payload, permissions }: ServerProps) {
  const adminRoute = payload.config.routes.admin
  const items: QuickCreateItem[] = QUICK_CREATE.filter(
    ({ slug }) => permissions?.collections?.[slug]?.create,
  ).map(({ slug, label, icon }) => ({
    href: `${adminRoute}/collections/${slug}/create`,
    label,
    icon,
  }))

  if (items.length === 0) return null
  return <QuickCreateMenu items={items} />
}

export default QuickCreate
