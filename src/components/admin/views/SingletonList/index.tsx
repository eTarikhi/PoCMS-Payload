import type { ListViewServerProps } from 'payload'
import { redirect } from 'next/navigation'

/**
 * List view for one-document collections (Header, About). The frontend reads the first document
 * only, so a list adds a click and invites duplicates: go straight to the document, or to the
 * create form when there is none yet. `data` is Payload's already access-checked list query.
 */
export function SingletonListView({ collectionConfig, data, payload }: ListViewServerProps) {
  const base = `${payload.config.routes.admin}/collections/${collectionConfig.slug}`
  const first = data?.docs?.[0] as { id?: number | string } | undefined
  redirect(first?.id !== undefined ? `${base}/${first.id}` : `${base}/create`)
}

export default SingletonListView
