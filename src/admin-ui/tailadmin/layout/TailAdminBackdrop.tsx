'use client'

import { useSidebar } from '../context/TailAdminSidebarContext'

/** Ported from TailAdmin Free `src/layout/Backdrop.tsx`. */
const TailAdminBackdrop: React.FC = () => {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar()

  if (!isMobileOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 bg-gray-900/50 xl:hidden"
      onClick={toggleMobileSidebar}
      aria-hidden="true"
    />
  )
}

export default TailAdminBackdrop
