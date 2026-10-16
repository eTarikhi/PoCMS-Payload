import type { ReactNode } from 'react'

export default function PersianLayout({ children }: { children: ReactNode }) {
  return (
    <div lang="fa" dir="rtl" className="locale-fa">
      {children}
    </div>
  )
}
