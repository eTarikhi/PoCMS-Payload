import type { ReactNode } from 'react'

// Inter (ADR 0003), self-hosted from npm: no request to Google at build or run time.
import '@fontsource-variable/inter/wght.css'
import '@/styles/admin/admin-ui.css'

/**
 * Registered in `admin.components.providers`. Loads the admin stylesheet (tokens, Payload overrides,
 * Tailwind utilities) for every admin route, including the login page. It adds no client-side
 * provider: tooltips are used only inside the lazily loaded UI kit, which wraps itself in one, so
 * the tooltip code stays out of every admin page's bundle.
 */
export function AdminUIProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>
}
