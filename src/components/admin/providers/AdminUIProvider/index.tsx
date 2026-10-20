import type { ReactNode } from 'react'

import { PaginationLabels } from '@/components/admin/providers/PaginationLabels'

// Inter (ADR 0003), self-hosted from npm: no request to Google at build or run time.
import '@fontsource-variable/inter/wght.css'
import '@/styles/admin/admin-ui.css'

/**
 * Registered in `admin.components.providers`. Loads the admin stylesheet (tokens, Payload overrides,
 * Tailwind utilities) for every admin route, including the login page. Its only client-side piece is
 * `PaginationLabels` (about 0.5 kB), which adds the accessible name Payload's pagination arrows are
 * missing; tooltips are used only inside the gallery's lazily loaded element demos, which wrap
 * themselves in a provider, so the tooltip code stays out of every admin page's bundle.
 */
export function AdminUIProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      <PaginationLabels />
      {children}
    </>
  )
}
