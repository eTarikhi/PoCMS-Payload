import { notFound, permanentRedirect, redirect } from 'next/navigation'

import { findCachedRedirect } from '@/app/(frontend)/lib/redirects'

export type PayloadRedirectsProps = {
  url: string
  disableNotFound?: boolean
}

/**
 * Server component that checks `@payloadcms/plugin-redirects` for `url` and triggers
 * a permanent (`301`/`308`) or temporary (`302`/`307`) redirect before falling through to `notFound()`.
 */
export async function PayloadRedirects({
  url,
  disableNotFound = false,
}: PayloadRedirectsProps) {
  const matched = await findCachedRedirect(url)
  if (matched) {
    if (matched.statusCode === 301) {
      permanentRedirect(matched.destination)
    }
    redirect(matched.destination)
  }

  if (!disableNotFound) {
    notFound()
  }

  return null
}
