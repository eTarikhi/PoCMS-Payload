'use client'

import Link from 'next/link'
import type React from 'react'
import { useEffect, useRef } from 'react'

import { cn } from '../lib/cn'

/**
 * Ported from TailAdmin Free `src/components/ui/dropdown/Dropdown.tsx` and
 * `DropdownItem.tsx` (plus the `useClickOutside` behaviour they rely on).
 *
 * The only structural change is that `DropdownItem` renders a Next.js `<Link>`
 * for internal hrefs and a plain `<a>` for external ones, instead of the
 * next-intl `Link` used upstream (this repository has no next-intl).
 */
export type DropdownProps = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

export function Dropdown({ isOpen, onClose, children, className }: DropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (
        dropdownRef.current &&
        target &&
        !dropdownRef.current.contains(target) &&
        !target.closest('.dropdown-toggle')
      ) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={dropdownRef}
      role="menu"
      className={cn(
        'absolute inset-e-0 z-40 mbs-2 rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark',
        className,
      )}
    >
      {children}
    </div>
  )
}

export type DropdownItemProps = {
  tag?: 'a' | 'button'
  href?: string
  onClick?: () => void
  onItemClick?: () => void
  baseClassName?: string
  className?: string
  children: React.ReactNode
  icon?: React.ReactNode
}

export function DropdownItem({
  tag = 'button',
  href,
  onClick,
  onItemClick,
  baseClassName = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-theme-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white',
  className,
  children,
  icon,
}: DropdownItemProps) {
  const handleClick = () => {
    onClick?.()
    onItemClick?.()
  }

  const content = (
    <>
      {icon ? <span className="flex items-center text-gray-500 dark:text-gray-400">{icon}</span> : null}
      {children}
    </>
  )

  if (href) {
    if (href.startsWith('http')) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(baseClassName, className)}
          onClick={handleClick}
        >
          {content}
        </a>
      )
    }
    return (
      <Link href={href} className={cn(baseClassName, className)} onClick={handleClick}>
        {content}
      </Link>
    )
  }

  if (tag === 'a') {
    return (
      <a href={href ?? '#'} className={cn(baseClassName, className)} onClick={handleClick}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" onClick={handleClick} className={cn(baseClassName, className)}>
      {content}
    </button>
  )
}

export default Dropdown
