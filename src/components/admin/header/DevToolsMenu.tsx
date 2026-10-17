'use client'

import { toast } from '@payloadcms/ui'
import {
  BugIcon,
  DatabaseZapIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import React, { useRef, useState } from 'react'

import { cn } from '../lib/utils'
import { buttonVariants } from '../ui/button'
import { useDismissable } from './useDismissable'

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

/** The code generators (`POST /api/dev-generate`), as in package.json's generate scripts. */
const GENERATORS = [
  { target: 'types', label: 'Types', command: 'node scripts/generate.mjs types' },
  { target: 'importmap', label: 'Import map', command: 'node scripts/generate.mjs importmap' },
  { target: 'db-schema', label: 'DB schema', command: 'node scripts/generate.mjs db-schema' },
  { target: 'graphql', label: 'GraphQL schema', command: 'node scripts/generate.mjs graphql' },
  { target: 'nav-icons', label: 'Nav icons', command: 'node scripts/generate-nav-icons.mjs' },
] as const

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
 * library on every page): cache actions (site cache; bundler cache in development), the code
 * generators in development, and links that open in a new tab. Escape and outside clicks close the menu.
 */
export function DevToolsMenu({
  adminRoute,
  apiRoute,
  playgroundURL,
  canResetBundler,
}: {
  adminRoute: string
  apiRoute: string
  playgroundURL: string | null
  /** Development only: the bundler cache can't be reset in a production build. */
  canResetBundler: boolean
}) {
  // Code generators and the bundler reset only make sense on the development server.
  const devServer = canResetBundler
  const pathname = usePathname()
  const ref = useRef<HTMLDetailsElement>(null)
  const pageJSON = restURLFor(pathname, adminRoute, apiRoute)

  useDismissable(ref)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (
    trigger: HTMLElement,
    key: string,
    endpoint: string,
    success: string,
    failure: string,
  ) => {
    setBusy(key)
    try {
      const res = await fetch(`${apiRoute}${endpoint}`, { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      toast.success(success)
      trigger.closest('details')?.removeAttribute('open')
    } catch {
      toast.error(failure)
    } finally {
      setBusy(null)
    }
  }

  const [generating, setGenerating] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<{ target: string; ok: boolean; text: string } | null>(null)

  const generate = async (target: string, label: string) => {
    setGenerating(target)
    try {
      const res = await fetch(`${apiRoute}/dev-generate?target=${target}`, {
        method: 'POST',
        credentials: 'include',
      })
      const body = (await res.json()) as { ok?: boolean; durationMs?: number; error?: string }
      const seconds = ((body.durationMs ?? 0) / 1000).toFixed(1)
      if (!res.ok || !body.ok) throw new Error(body.error || String(res.status))
      setLastRun({ target, ok: true, text: `${label}: done in ${seconds}s` })
      toast.success(`${label}: generated in ${seconds}s.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed'
      setLastRun({ target, ok: false, text: `${label}: ${message}` })
      toast.error(`${label} failed: ${message}`)
    } finally {
      setGenerating(null)
    }
  }

  const actions = [
    {
      key: 'site',
      label: 'Refresh site cache',
      icon: <RefreshCwIcon aria-hidden />,
      onClick: (trigger: HTMLElement) =>
        run(
          trigger,
          'site',
          '/revalidate-site',
          'The site will show the latest content on the next visit.',
          'Could not refresh the site cache. Try again.',
        ),
    },
    ...(canResetBundler
      ? [
          {
            key: 'bundler',
            label: 'Reset bundler cache',
            icon: <DatabaseZapIcon aria-hidden />,
            onClick: (trigger: HTMLElement) =>
              run(
                trigger,
                'bundler',
                '/reset-bundler-cache',
                'Bundler cache cleared and every page purged. Restart the dev server for a clean rebuild.',
                'Could not reset the bundler cache.',
              ),
          },
        ]
      : []),
  ]

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
          className="acn:absolute acn:top-full acn:right-0 acn:z-50 acn:mt-2 acn:w-64 acn:rounded-md acn:bg-popover acn:p-1 acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10"
        >
          <p className="acn:m-0 acn:px-2 acn:pt-1 acn:pb-1.5 acn:text-xs acn:font-medium acn:text-muted-foreground">
            Developer tools
          </p>
          <ul className="acn:m-0 acn:list-none acn:p-0">
            {actions.map((action) => (
              <li key={action.key}>
                <button
                  type="button"
                  data-testid={`dev-action-${action.key}`}
                  onClick={(event) => action.onClick(event.currentTarget)}
                  disabled={busy !== null}
                  aria-busy={busy === action.key}
                  className="acn:flex acn:w-full acn:cursor-pointer acn:items-center acn:gap-2 acn:rounded-sm acn:border-0 acn:bg-transparent acn:px-2 acn:py-1.5 acn:text-left acn:text-sm acn:text-popover-foreground acn:outline-none acn:hover:bg-accent acn:focus-visible:bg-accent acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:disabled:cursor-wait acn:disabled:opacity-60 acn:[&_svg]:size-4 acn:[&_svg]:text-muted-foreground"
                >
                  {action.icon}
                  {busy === action.key ? 'Working…' : action.label}
                </button>
              </li>
            ))}
          </ul>
          {devServer ? (
            <section aria-label="Generate" data-testid="dev-generate" className="acn:mt-1">
              <div role="separator" className="acn:mb-1 acn:h-px acn:bg-border" />
              <p className="acn:m-0 acn:px-2 acn:pt-1 acn:pb-1.5 acn:text-xs acn:font-medium acn:text-muted-foreground">
                Generate
              </p>
              <div className="acn:grid acn:grid-cols-2 acn:gap-1 acn:px-1">
                {GENERATORS.map((generator) => (
                  <button
                    key={generator.target}
                    type="button"
                    title={generator.command}
                    data-testid={`dev-generate-${generator.target}`}
                    onClick={() => generate(generator.target, generator.label)}
                    disabled={generating !== null}
                    aria-busy={generating === generator.target}
                    className="acn:flex acn:cursor-pointer acn:items-center acn:gap-1.5 acn:rounded-sm acn:border acn:border-border acn:bg-transparent acn:px-2 acn:py-1 acn:text-left acn:text-xs acn:text-popover-foreground acn:outline-none acn:hover:bg-accent acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:disabled:cursor-wait acn:disabled:opacity-60"
                  >
                    {generating === generator.target ? (
                      <LoaderCircleIcon aria-hidden className="acn:size-3.5 acn:animate-spin" />
                    ) : null}
                    {generator.label}
                  </button>
                ))}
              </div>
              <div className="acn:px-1 acn:pt-1">
                <button
                  type="button"
                  title="pnpm generate:all"
                  data-testid="dev-generate-all"
                  onClick={() => generate('all', 'generate:all')}
                  disabled={generating !== null}
                  aria-busy={generating === 'all'}
                  className="acn:flex acn:w-full acn:cursor-pointer acn:items-center acn:justify-center acn:gap-1.5 acn:rounded-sm acn:border-0 acn:bg-primary acn:px-2 acn:py-1.5 acn:text-xs acn:font-medium acn:text-primary-foreground acn:outline-none acn:hover:bg-primary/90 acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:disabled:cursor-wait acn:disabled:opacity-60"
                >
                  {generating === 'all' ? (
                    <LoaderCircleIcon aria-hidden className="acn:size-3.5 acn:animate-spin" />
                  ) : (
                    <PlayIcon aria-hidden className="acn:size-3.5" />
                  )}
                  Run generate:all
                </button>
              </div>
              <p
                role="status"
                aria-live="polite"
                className={cn(
                  'acn:m-0 acn:min-h-5 acn:px-2 acn:pt-1 acn:text-xs acn:text-muted-foreground',
                  lastRun && !lastRun.ok && 'acn:text-destructive',
                )}
              >
                {generating ? 'Running…' : (lastRun?.text ?? '')}
              </p>
            </section>
          ) : null}
          <div role="separator" className="acn:my-1 acn:h-px acn:bg-border" />
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
