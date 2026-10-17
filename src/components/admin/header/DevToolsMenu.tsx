'use client'

import { BugIcon, ExternalLinkIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import React, { useEffect, useRef } from 'react'

import { cn } from '../lib/utils'
import { buttonVariants } from '../ui/button'

/** The GraphQL logo (simplified), drawn with currentColor. */
function GraphQLIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5z" strokeLinejoin="round" />
      <path d="M12 3.2 4.4 16.4h15.2z" strokeLinejoin="round" />
      <g fill="currentColor" stroke="none">
        <circle cx="12" cy="2.6" r="1.6" />
        <circle cx="20.2" cy="7.25" r="1.6" />
        <circle cx="20.2" cy="16.75" r="1.6" />
        <circle cx="12" cy="21.4" r="1.6" />
        <circle cx="3.8" cy="16.75" r="1.6" />
        <circle cx="3.8" cy="7.25" r="1.6" />
      </g>
    </svg>
  )
}

/** The REST URL behind the current admin page, if it shows a list, a document or a global. */
function restURLFor(pathname: string, adminRoute: string, apiRoute: string) {
  const rest = pathname.startsWith(adminRoute) ? pathname.slice(adminRoute.length) : ''
  const doc = /^\/collections\/([^/]+)\/([^/]+)$/.exec(rest)
  if (doc && doc[2] !== 'create' && doc[2] !== 'trash') {
    return { label: 'This document (REST)', href: `${apiRoute}/${doc[1]}/${doc[2]}?depth=1` }
  }
  const list = /^\/collections\/([^/]+)(\/trash)?$/.exec(rest)
  if (list) {
    const trash = list[2] ? '&trash=true&where[deletedAt][exists]=true' : ''
    return { label: 'This list (REST)', href: `${apiRoute}/${list[1]}?depth=0&limit=10${trash}` }
  }
  const global = /^\/globals\/([^/]+)$/.exec(rest)
  if (global)
    return { label: 'This global (REST)', href: `${apiRoute}/globals/${global[1]}?depth=1` }
  return null
}

const iconButton = cn(
  buttonVariants({ variant: 'ghost', size: 'icon' }),
  'acn:rounded-full acn:text-muted-foreground acn:hover:text-foreground',
)

/**
 * GraphQL Playground button and a "Developer tools" disclosure (native details/summary: no popup
 * library on every page). Links open in a new tab. Escape and outside clicks close the menu.
 */
export function DevToolsMenu({
  adminRoute,
  apiRoute,
  playgroundURL,
}: {
  adminRoute: string
  apiRoute: string
  playgroundURL: string | null
}) {
  const pathname = usePathname()
  const ref = useRef<HTMLDetailsElement>(null)
  const pageJSON = restURLFor(pathname, adminRoute, apiRoute)

  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current
      if (!details?.open) return
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !details.contains(event.target as Node)
      ) {
        details.open = false
        if (event instanceof KeyboardEvent) details.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [])

  const links = [
    ...(pageJSON ? [pageJSON] : []),
    { label: 'My permissions', href: `${apiRoute}/access` },
    { label: 'Signed-in user', href: `${apiRoute}/users/me` },
    { label: 'Payload docs', href: 'https://payloadcms.com/docs' },
  ]

  return (
    <div className="acn:flex acn:items-center acn:gap-1" data-testid="dev-tools">
      {playgroundURL ? (
        <a
          href={playgroundURL}
          target="_blank"
          rel="noopener noreferrer"
          data-slot="button"
          aria-label="GraphQL Playground (opens in a new tab)"
          title="GraphQL Playground"
          className={iconButton}
        >
          <GraphQLIcon aria-hidden />
        </a>
      ) : null}
      <details ref={ref} className="acn:relative">
        <summary
          aria-label="Developer tools"
          title="Developer tools"
          className={cn(iconButton, 'acn:list-none acn:[&::-webkit-details-marker]:hidden')}
        >
          <BugIcon aria-hidden />
        </summary>
        <nav
          aria-label="Developer tools"
          className="acn:absolute acn:top-full acn:right-0 acn:z-50 acn:mt-2 acn:w-56 acn:rounded-md acn:bg-popover acn:p-1 acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10"
        >
          <p className="acn:m-0 acn:px-2 acn:pt-1 acn:pb-1.5 acn:text-xs acn:font-medium acn:text-muted-foreground">
            Developer tools
          </p>
          <ul className="acn:m-0 acn:list-none acn:p-0">
            {links.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-slot="button"
                  className="acn:flex acn:items-center acn:gap-2 acn:rounded-sm acn:px-2 acn:py-1.5 acn:text-sm acn:text-popover-foreground acn:no-underline acn:outline-none acn:hover:bg-accent acn:focus-visible:bg-accent acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50"
                >
                  {link.label}
                  <ExternalLinkIcon
                    aria-hidden
                    className="acn:ml-auto acn:size-3.5 acn:text-muted-foreground"
                  />
                  <span className="acn:sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </details>
    </div>
  )
}
