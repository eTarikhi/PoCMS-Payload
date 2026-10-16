import type { ReactNode } from 'react'

import { TooltipProvider } from '@/components/admin/ui/tooltip'

// Inter (ADR 0003), self-hosted from npm: no request to Google at build or run time.
import '@fontsource-variable/inter/wght.css'
import '@/styles/admin/admin-ui.css'

/**
 * Registered in `admin.components.providers`. Loads the admin stylesheet (tokens, Payload overrides,
 * Tailwind utilities) for every admin route, including the login page, and gives all tooltips the
 * same open delay.
 */
export function AdminUIProvider({ children }: { children?: ReactNode }) {
  return <TooltipProvider delay={300}>{children}</TooltipProvider>
}
