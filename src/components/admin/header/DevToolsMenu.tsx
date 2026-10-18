'use client'

import { toast } from '@payloadcms/ui'
import {
  BugIcon,
  DatabaseIcon,
  DatabaseZapIcon,
  EraserIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PlayIcon,
  PowerIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import React, { type ReactNode, useRef, useState } from 'react'

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
const menuItem =
  'acn:flex acn:w-full acn:cursor-pointer acn:items-center acn:gap-2 acn:rounded-sm acn:border-0 acn:bg-transparent acn:px-2 acn:py-1.5 acn:text-left acn:text-sm acn:text-popover-foreground acn:no-underline acn:outline-none acn:hover:bg-accent acn:focus-visible:bg-accent acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:disabled:cursor-wait acn:disabled:opacity-60 acn:[&_svg]:size-4 acn:[&_svg]:shrink-0 acn:[&_svg]:text-muted-foreground'
const chip =
  'acn:flex acn:cursor-pointer acn:items-center acn:gap-1.5 acn:rounded-sm acn:border acn:border-border acn:bg-transparent acn:px-2 acn:py-1 acn:text-left acn:text-xs acn:text-popover-foreground acn:outline-none acn:hover:bg-accent acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:disabled:cursor-wait acn:disabled:opacity-60'

function Section({
  title,
  testId,
  children,
}: {
  title: string
  testId?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="acn:border-t acn:border-border acn:py-1"
    >
      <p className="acn:m-0 acn:px-2 acn:pt-1 acn:pb-1 acn:text-xs acn:font-medium acn:text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GraphQL Playground button and the "Developer tools" disclosure (native details/summary: no popup
 * library on every page). What it offers depends on where the admin runs:
 *
 * - Everywhere (development, production build, deployments): refresh the site cache, purge every
 *   cached page, migration status, the JSON behind the current page, permissions, the signed-in
 *   user, Payload docs.
 * - Development only (they change files or the dev server): reset the bundler cache, restart the
 *   dev server, create a migration, and the code generators.
 */
export function DevToolsMenu({
  adminRoute,
  apiRoute,
  playgroundURL,
  devServer,
  environment,
}: {
  adminRoute: string
  apiRoute: string
  playgroundURL: string | null
  devServer: boolean
  environment: { label: string; commit?: string }
}) {
  const pathname = usePathname()
  const ref = useRef<HTMLDetailsElement>(null)
  useDismissable(ref)
  const pageJSON = restURLFor(pathname, adminRoute, apiRoute)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [migration, setMigration] = useState('')

  /** POSTs to an endpoint; returns the JSON body, or throws with the server's error. */
  const post = async (endpoint: string) => {
    const res = await fetch(`${apiRoute}${endpoint}`, { method: 'POST', credentials: 'include' })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || body.ok === false) throw new Error(String(body.error || res.status))
    return body
  }

  const task = async (key: string, label: string, work: () => Promise<string>) => {
    setBusy(key)
    setStatus(null)
    try {
      const text = await work()
      setStatus({ ok: true, text })
      toast.success(text)
    } catch (error) {
      const text = `${label} failed: ${error instanceof Error ? error.message : 'error'}`
      setStatus({ ok: false, text })
      toast.error(text)
    } finally {
      setBusy(null)
    }
  }

  const restart = () =>
    task('restart', 'Restart', async () => {
      await post('/dev-restart')
      toast.info('Restarting the dev server…')
      // Wait until the server answers again (it compiles the admin on its first request).
      await sleep(2_000)
      for (let attempt = 0; attempt < 90; attempt++) {
        const alive = await fetch(`${apiRoute}/users/me`, {
          credentials: 'include',
          cache: 'no-store',
        })
          .then((res) => res.ok)
          .catch(() => false)
        if (alive) {
          window.location.reload()
          return 'Dev server restarted.'
        }
        await sleep(1_500)
      }
      throw new Error('the server did not come back within two minutes')
    })

  const generate = (target: string, label: string) =>
    task(`generate-${target}`, label, async () => {
      const body = await post(`/dev-generate?target=${target}`)
      return `${label}: done in ${(Number(body.durationMs ?? 0) / 1000).toFixed(1)}s`
    })

  const createMigration = () =>
    task('migrate', 'Create migration', async () => {
      const name = migration.trim() || 'admin_changes'
      const body = await post(`/dev-migrate?name=${encodeURIComponent(name)}`)
      setMigration('')
      return body.created
        ? `Migration created: ${String(body.created)}`
        : 'No schema changes: no migration created.'
    })

  const links = [
    // Also in the header as an icon, which phones hide for room.
    ...(playgroundURL ? [{ label: 'GraphQL Playground', href: playgroundURL }] : []),
    ...(pageJSON ? [pageJSON] : []),
    { label: 'Migration status', href: `${apiRoute}/migration-status` },
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
          // Phones: hidden for room; the menu's Inspect section links to it too.
          className={cn(iconButton, 'acn:max-sm:hidden')}
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
          className="acn:absolute acn:top-full acn:right-0 acn:z-50 acn:mt-2 acn:max-h-[calc(100vh-5rem)] acn:w-72 acn:overflow-y-auto acn:max-sm:fixed acn:max-sm:inset-x-2 acn:max-sm:top-[calc(var(--app-header-height)+0.25rem)] acn:max-sm:mt-0 acn:max-sm:w-auto acn:rounded-md acn:bg-popover acn:p-1 acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10"
        >
          <div className="acn:flex acn:items-center acn:justify-between acn:gap-2 acn:px-2 acn:pt-1 acn:pb-1.5">
            <span className="acn:text-xs acn:font-medium acn:text-muted-foreground">
              Developer tools
            </span>
            <span
              data-testid="dev-environment"
              className={cn(
                'acn:rounded-full acn:px-2 acn:text-[0.6875rem] acn:leading-5 acn:font-medium',
                devServer
                  ? 'acn:bg-warning-soft acn:text-warning'
                  : 'acn:bg-muted acn:text-foreground',
              )}
            >
              {environment.label}
              {environment.commit ? ` · ${environment.commit}` : ''}
            </span>
          </div>

          <Section title="Cache">
            <button
              type="button"
              data-testid="dev-action-site"
              className={menuItem}
              disabled={busy !== null}
              onClick={() =>
                task('site', 'Refresh site cache', async () => {
                  await post('/revalidate-site')
                  return 'The site will show the latest content on the next visit.'
                })
              }
            >
              <RefreshCwIcon aria-hidden />
              Refresh site cache
            </button>
            <button
              type="button"
              data-testid="dev-action-purge"
              className={menuItem}
              disabled={busy !== null}
              onClick={() =>
                task('purge', 'Purge cached pages', async () => {
                  await post('/purge-pages')
                  return 'Every cached page will re-render on its next visit.'
                })
              }
            >
              <EraserIcon aria-hidden />
              Purge all cached pages
            </button>
            {devServer ? (
              <button
                type="button"
                data-testid="dev-action-bundler"
                className={menuItem}
                disabled={busy !== null}
                onClick={() =>
                  task('bundler', 'Reset bundler cache', async () => {
                    await post('/reset-bundler-cache')
                    return 'Bundler cache cleared and every page purged. Restart the dev server for a clean rebuild.'
                  })
                }
              >
                <DatabaseZapIcon aria-hidden />
                Reset bundler cache
              </button>
            ) : null}
          </Section>

          {devServer ? (
            <Section title="Dev server">
              <button
                type="button"
                data-testid="dev-action-restart"
                className={menuItem}
                disabled={busy !== null}
                onClick={restart}
              >
                {busy === 'restart' ? (
                  <LoaderCircleIcon aria-hidden className="acn:animate-spin" />
                ) : (
                  <PowerIcon aria-hidden />
                )}
                {busy === 'restart' ? 'Restarting…' : 'Restart dev server'}
              </button>
            </Section>
          ) : null}

          {devServer ? (
            <Section title="Database" testId="dev-database">
              <form
                className="acn:flex acn:gap-1 acn:px-1 acn:pb-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  void createMigration()
                }}
              >
                <label className="acn:sr-only" htmlFor="dev-migration-name">
                  Migration name
                </label>
                <input
                  id="dev-migration-name"
                  value={migration}
                  onChange={(event) => setMigration(event.target.value)}
                  placeholder="migration_name"
                  maxLength={60}
                  className="acn:h-7 acn:min-w-0 acn:flex-1 acn:rounded-sm acn:border acn:border-border acn:bg-transparent acn:px-2 acn:text-xs acn:text-foreground acn:outline-none acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50"
                />
                <button
                  type="submit"
                  data-testid="dev-action-migrate"
                  className={chip}
                  disabled={busy !== null}
                >
                  {busy === 'migrate' ? (
                    <LoaderCircleIcon aria-hidden className="acn:size-3.5 acn:animate-spin" />
                  ) : (
                    <DatabaseIcon aria-hidden className="acn:size-3.5" />
                  )}
                  Create migration
                </button>
              </form>
            </Section>
          ) : null}

          {devServer ? (
            <Section title="Generate" testId="dev-generate">
              <div className="acn:grid acn:grid-cols-2 acn:gap-1 acn:px-1">
                {GENERATORS.map((generator) => (
                  <button
                    key={generator.target}
                    type="button"
                    title={generator.command}
                    data-testid={`dev-generate-${generator.target}`}
                    onClick={() => generate(generator.target, generator.label)}
                    disabled={busy !== null}
                    aria-busy={busy === `generate-${generator.target}`}
                    className={chip}
                  >
                    {busy === `generate-${generator.target}` ? (
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
                  disabled={busy !== null}
                  aria-busy={busy === 'generate-all'}
                  className="acn:flex acn:w-full acn:cursor-pointer acn:items-center acn:justify-center acn:gap-1.5 acn:rounded-sm acn:border-0 acn:bg-primary acn:px-2 acn:py-1.5 acn:text-xs acn:font-medium acn:text-primary-foreground acn:outline-none acn:hover:bg-primary/90 acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:disabled:cursor-wait acn:disabled:opacity-60"
                >
                  {busy === 'generate-all' ? (
                    <LoaderCircleIcon aria-hidden className="acn:size-3.5 acn:animate-spin" />
                  ) : (
                    <PlayIcon aria-hidden className="acn:size-3.5" />
                  )}
                  Run generate:all
                </button>
              </div>
            </Section>
          ) : null}

          <p
            role="status"
            aria-live="polite"
            data-testid="dev-status"
            className={cn(
              'acn:m-0 acn:px-2 acn:text-xs acn:text-muted-foreground',
              (busy || status) && 'acn:py-1',
              status && !status.ok && 'acn:text-destructive',
            )}
          >
            {busy ? 'Running…' : (status?.text ?? '')}
          </p>

          <Section title="Inspect">
            <ul className="acn:m-0 acn:list-none acn:p-0">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-slot="button"
                    className={menuItem}
                  >
                    {link.label}
                    <ExternalLinkIcon aria-hidden className="acn:ml-auto acn:size-3.5" />
                    <span className="acn:sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        </nav>
      </details>
    </div>
  )
}
