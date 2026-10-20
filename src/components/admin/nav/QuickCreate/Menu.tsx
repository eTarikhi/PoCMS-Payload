'use client'

import {
  AwardIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  FileTextIcon,
  FolderKanbanIcon,
  ImageUpIcon,
  PlusIcon,
} from 'lucide-react'
import Link from 'next/link'
import React, { useEffect, useRef } from 'react'

import { buttonVariants } from '@/components/admin/elements/Button'
import { cn } from '@/components/admin/utilities/cn'

export type QuickCreateItem = {
  href: string
  label: string
  icon: 'article' | 'project' | 'media' | 'experience' | 'certificate'
}

const ICONS = {
  article: FileTextIcon,
  project: FolderKanbanIcon,
  media: ImageUpIcon,
  experience: BriefcaseIcon,
  certificate: AwardIcon,
} satisfies Record<QuickCreateItem['icon'], React.ComponentType<{ className?: string }>>

/**
 * The sidebar "Create" control: a disclosure (native details/summary) holding plain links, the
 * pattern WAI recommends for navigation lists. It renders on every admin page, so it avoids a menu
 * library in the shared bundle; Escape and outside clicks close it.
 */
export function QuickCreateMenu({ items }: { items: QuickCreateItem[] }) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const details = ref.current
    if (!details) return
    const close = (restoreFocus: boolean) => {
      if (!details.open) return
      details.open = false
      if (restoreFocus) details.querySelector('summary')?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(details.contains(document.activeElement))
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!details.contains(event.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  return (
    <details
      ref={ref}
      data-testid="quick-create"
      className="acn:group acn:relative acn:mb-5 acn:self-stretch"
    >
      <summary
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'acn:w-full acn:cursor-pointer acn:list-none acn:justify-start acn:gap-2 acn:[&::-webkit-details-marker]:hidden',
        )}
      >
        <PlusIcon aria-hidden />
        <span className="quick-create__label">Create</span>
        <ChevronDownIcon
          aria-hidden
          className="quick-create__chevron acn:ml-auto acn:transition-transform acn:group-open:rotate-180"
        />
      </summary>
      <nav
        aria-label="Create new"
        className="acn:absolute acn:inset-x-0 acn:top-full acn:z-50 acn:mt-1 acn:rounded-md acn:bg-popover acn:p-1 acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10 acn:[details:not([open])>&]:hidden"
      >
        <ul className="acn:m-0 acn:list-none acn:p-0">
          {items.map(({ href, label, icon }) => {
            const Icon = ICONS[icon]
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => ref.current?.removeAttribute('open')}
                  className="acn:flex acn:items-center acn:gap-2 acn:rounded-sm acn:px-2 acn:py-1.5 acn:text-sm acn:text-popover-foreground acn:no-underline acn:outline-none acn:hover:bg-accent acn:focus-visible:bg-accent acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:pointer-coarse:min-h-10 acn:[&_svg]:size-4 acn:[&_svg]:text-muted-foreground"
                >
                  <Icon aria-hidden />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </details>
  )
}
