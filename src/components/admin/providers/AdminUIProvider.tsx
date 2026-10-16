import type { ReactNode } from 'react'

// Inter (ADR 0003), self-hosted from npm: no request to Google at build or run time.
import '@fontsource-variable/inter/wght.css'
import '@/styles/admin/admin-ui.css'

/**
 * Registered in `admin.components.providers`. Loads the admin stylesheet (tokens, Payload overrides,
 * Tailwind utilities) for every admin route, including the login page.
 */
export function AdminUIProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>
}
