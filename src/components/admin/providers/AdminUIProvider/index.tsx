import type { ReactNode } from 'react'

import { AdminDomFixes } from '@/components/admin/providers/AdminDomFixes'

// Inter (ADR 0003), self-hosted from npm: no request to Google at build or run time.
import '@fontsource-variable/inter/wght.css'
import '@/styles/admin/admin-ui.css'

/**
 * Registered in `admin.components.providers`. Loads the admin stylesheet (tokens, Payload overrides,
 * Tailwind utilities) for every admin route, including the login page. Its only client-side piece is
 * `AdminDomFixes` (under 1 kB), which adds what Payload's config cannot: the main landmark and skip
 * link, names for the row-selection checkboxes, the paginator arrows' names and the hidden select
 * chevrons out of the tab order. Tooltips are used only inside the gallery's lazily loaded element
 * demos, which wrap themselves in a provider, so the tooltip code stays out of every admin page.
 */
export function AdminUIProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      <AdminDomFixes />
      {children}
    </>
  )
}
