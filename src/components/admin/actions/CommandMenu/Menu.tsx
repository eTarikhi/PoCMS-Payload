'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { toast, useAuth, useConfig, useEntityVisibility, useTheme } from '@payloadcms/ui'
import {
  ActivityIcon,
  CalendarClockIcon,
  ClockIcon,
  ComponentIcon,
  CornerDownLeftIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  KeyboardIcon,
  LayoutDashboardIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SunIcon,
  TerminalIcon,
  UserRoundIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import React, {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { hasCapability } from '@/access/permissions'
import { cn } from '@/components/admin/utilities/cn'
import { switchTheme } from '@/components/admin/utilities/themeTransition'

import { matchScore } from './match'
import { readRecent } from './recent'
import { GO_SHORTCUTS, keyShortcutsEnabled, setKeyShortcutsEnabled } from './shortcuts'

/*
 * Height of the part of the page the user can see. On phones the on-screen keyboard covers the
 * bottom of the page without resizing it, so a dialog sized in vh hides its last results behind
 * the keyboard; the visual viewport shrinks instead, and the dialog's max height follows it.
 */
const subscribeVisibleHeight = (onChange: () => void) => {
  window.visualViewport?.addEventListener('resize', onChange)
  return () => window.visualViewport?.removeEventListener('resize', onChange)
}
const visibleHeight = () => Math.round(window.visualViewport?.height ?? window.innerHeight)
const useVisibleHeight = () => useSyncExternalStore(subscribeVisibleHeight, visibleHeight, () => 0)

type Item = {
  id: string
  group: Group
  label: string
  hint?: string
  keywords?: string[]
  icon: ReactNode
  run: () => void
}
type Group = 'Recent' | 'Go to' | 'Create' | 'Documents' | 'Actions'
const GROUPS: Group[] = ['Recent', 'Go to', 'Create', 'Documents', 'Actions']

type SearchHit = { slug: string; id: number | string; title: string }
type Searchable = { slug: string; titleField: string; label: string }

/** Labels may be strings or per-language records (functions are not used in this project). */
const labelText = (label: unknown, fallback: string, language: string): string => {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const record = label as Record<string, string>
    return record[language] ?? record.en ?? fallback
  }
  return fallback
}

/**
 * Command menu (Ctrl+K / Cmd+K): jump to any collection, global or recent document, create
 * documents, search document titles across collections, and run admin actions. Respects the
 * user's permissions and Payload's entity visibility. Loaded on first use by CommandMenuTrigger.
 *
 * Accessibility: an ARIA combobox (the input) controls a listbox of grouped options; arrow keys
 * move the active option (aria-activedescendant), Enter runs it, Escape closes the dialog.
 */
export default function CommandMenu({
  open,
  onOpenChange,
  onShowShortcuts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onShowShortcuts: () => void
}) {
  const { config } = useConfig()
  const { permissions, user } = useAuth()
  const { visibleEntities } = useEntityVisibility()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const visibleViewportHeight = useVisibleHeight()

  const admin = config.routes.admin
  const language = 'en'

  const close = () => onOpenChange(false)
  const go = (path: string) => {
    close()
    router.push(path)
  }

  const collections = useMemo(
    () =>
      config.collections
        .filter((collection) => visibleEntities.collections.includes(collection.slug))
        .map((collection) => ({
          slug: collection.slug,
          plural: labelText(collection.labels?.plural, collection.slug, language),
          singular: labelText(collection.labels?.singular, collection.slug, language),
          titleField: collection.admin?.useAsTitle ?? 'id',
          canCreate: Boolean(permissions?.collections?.[collection.slug]?.create),
          canRead: Boolean(permissions?.collections?.[collection.slug]?.read),
        })),
    [config.collections, visibleEntities.collections, permissions],
  )
  const globals = useMemo(
    () =>
      config.globals
        .filter((global) => visibleEntities.globals.includes(global.slug))
        .map((global) => ({
          slug: global.slug,
          label: labelText(global.label, global.slug, language),
        })),
    [config.globals, visibleEntities.globals],
  )
  const searchable: Searchable[] = useMemo(
    () =>
      collections
        .filter((collection) => collection.canRead && collection.titleField !== 'id')
        .map((collection) => ({
          slug: collection.slug,
          titleField: collection.titleField,
          label: collection.singular,
        })),
    [collections],
  )

  const search = useDocumentSearch(query, searchable, `${config.serverURL}${config.routes.api}`)

  // Rebuilt each time the menu opens, so labels follow the current theme and sidebar state.
  const items = useMemo<Item[]>(() => {
    if (!open) return []
    const labelFor = (slug: string) =>
      collections.find((collection) => collection.slug === slug)?.singular ??
      globals.find((global) => global.slug === slug)?.label ??
      slug
    const navOpen = Boolean(document.querySelector('.nav.nav--nav-open'))
    const rail = document.querySelector('#nav-rail-toggle')?.getAttribute('aria-pressed') === 'true'
    const siteURL = process.env.NEXT_PUBLIC_SITE_URL || '/'
    const list: Item[] = [
      ...readRecent()
        .slice(0, 5)
        .map<Item>((entry) => ({
          id: `recent:${entry.path}`,
          group: 'Recent',
          label: entry.title,
          hint: labelFor(entry.slug),
          icon: <ClockIcon aria-hidden />,
          run: () => go(entry.path),
        })),
      {
        id: 'go:dashboard',
        group: 'Go to',
        label: 'Dashboard',
        keywords: ['home', 'overview'],
        icon: <LayoutDashboardIcon aria-hidden />,
        run: () => go(admin),
      },
      ...collections.map<Item>((collection) => ({
        id: `go:${collection.slug}`,
        group: 'Go to',
        label: collection.plural,
        keywords: [collection.slug, 'list', 'collection'],
        icon: <FolderIcon aria-hidden />,
        run: () => go(`${admin}/collections/${collection.slug}`),
      })),
      ...globals.map<Item>((global) => ({
        id: `go:global:${global.slug}`,
        group: 'Go to',
        label: global.label,
        keywords: [global.slug, 'global', 'settings'],
        icon: <GlobeIcon aria-hidden />,
        run: () => go(`${admin}/globals/${global.slug}`),
      })),
      {
        id: 'go:account',
        group: 'Go to',
        label: 'My account',
        keywords: ['profile', 'password', 'language', 'preferences'],
        icon: <UserRoundIcon aria-hidden />,
        run: () => go(`${admin}/account`),
      },
      ...(hasCapability(user, 'viewSystem')
        ? [
            {
              id: 'go:system',
              group: 'Go to' as const,
              label: 'System information',
              keywords: ['versions', 'database', 'neon', 'postgres', 'health', 'environment'],
              icon: <ActivityIcon aria-hidden />,
              run: () => go(`${admin}/system`),
            },
          ]
        : []),
      ...(hasCapability(user, 'manageDatabase')
        ? [
            {
              id: 'go:database',
              group: 'Go to' as const,
              label: 'Database manager',
              keywords: [
                'postgres',
                'neon',
                'backup',
                'restore',
                'repair',
                'vacuum',
                'snapshots',
                'branches',
                'supabase',
                'prisma',
              ],
              icon: <DatabaseIcon aria-hidden />,
              run: () => go(`${admin}/database`),
            },
          ]
        : []),
      ...(hasCapability(user, 'manageJobs')
        ? [
            {
              id: 'go:jobs',
              group: 'Go to' as const,
              label: 'Scheduled jobs',
              keywords: ['queue', 'cron', 'tasks', 'background', 'run', 'cancel'],
              icon: <CalendarClockIcon aria-hidden />,
              run: () => go(`${admin}/jobs`),
            },
          ]
        : []),
      ...(process.env.NODE_ENV !== 'production' && hasCapability(user, 'useTerminal')
        ? [
            {
              id: 'go:terminal',
              group: 'Go to' as const,
              label: 'Dev terminal',
              keywords: ['shell', 'cli', 'bash', 'command', 'console'],
              icon: <TerminalIcon aria-hidden />,
              run: () => go(`${admin}/terminal`),
            },
          ]
        : []),
      ...(hasCapability(user, 'useDeveloperTools')
        ? [
            {
              id: 'go:gallery',
              group: 'Go to' as const,
              label: 'Component gallery',
              keywords: ['ui kit', 'design', 'tokens', 'components', 'widgets', 'elements'],
              icon: <ComponentIcon aria-hidden />,
              run: () => go(`${admin}/gallery`),
            },
          ]
        : []),
      ...collections
        .filter((collection) => collection.canCreate)
        .map<Item>((collection) => ({
          id: `create:${collection.slug}`,
          group: 'Create',
          label:
            collection.slug === 'media'
              ? 'Upload media'
              : `New ${collection.singular.toLowerCase()}`,
          keywords: ['create', 'add', 'new', collection.plural],
          icon: <PlusIcon aria-hidden />,
          run: () => go(`${admin}/collections/${collection.slug}/create`),
        })),
      {
        id: 'action:theme',
        group: 'Actions',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
        icon: theme === 'dark' ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />,
        run: () => {
          close()
          switchTheme(setTheme, theme === 'dark' ? 'light' : 'dark')
        },
      },
      // Desktop: collapse/expand to the icon rail. Mobile: Payload's menu button.
      window.matchMedia('(min-width: 1025px)').matches
        ? {
            id: 'action:rail',
            group: 'Actions' as const,
            label: rail ? 'Expand sidebar' : 'Collapse sidebar to icons',
            keywords: ['sidebar', 'rail', 'icons', 'compact', 'navigation'],
            icon: <PanelLeftIcon aria-hidden />,
            run: () => {
              close()
              document.querySelector<HTMLButtonElement>('#nav-rail-toggle')?.click()
            },
          }
        : {
            id: 'action:sidebar',
            group: 'Actions' as const,
            label: navOpen ? 'Close menu' : 'Open menu',
            keywords: ['sidebar', 'navigation', 'menu', 'toggle'],
            icon: <PanelLeftIcon aria-hidden />,
            run: () => {
              close()
              document.querySelector<HTMLButtonElement>('.nav-toggler')?.click()
            },
          },
      {
        id: 'action:refresh-cache',
        group: 'Actions',
        label: 'Refresh site cache',
        keywords: ['revalidate', 'publish', 'cache', 'site'],
        icon: <RefreshCwIcon aria-hidden />,
        run: () => {
          close()
          void fetch(`${config.serverURL}${config.routes.api}/revalidate-site`, {
            method: 'POST',
            credentials: 'include',
          }).then(
            (res) =>
              res.ok
                ? toast.success('The site will show the latest content on the next visit.')
                : toast.error('Could not refresh the site cache. Try again.'),
            () => toast.error('Could not refresh the site cache. Try again.'),
          )
        },
      },
      {
        id: 'action:view-site',
        group: 'Actions',
        label: 'View site',
        hint: 'New tab',
        keywords: ['open', 'public', 'website', 'preview'],
        icon: <ExternalLinkIcon aria-hidden />,
        run: () => {
          close()
          window.open(siteURL, '_blank', 'noopener,noreferrer')
        },
      },
      {
        id: 'action:shortcuts',
        group: 'Actions',
        label: 'Keyboard shortcuts',
        hint: '?',
        keywords: ['keys', 'hotkeys', 'help'],
        icon: <KeyboardIcon aria-hidden />,
        run: onShowShortcuts,
      },
      {
        id: 'action:logout',
        group: 'Actions',
        label: 'Log out',
        keywords: ['sign out', 'exit'],
        icon: <LogOutIcon aria-hidden />,
        run: () => go(`${admin}/logout`),
      },
    ]
    return list
    // `go`, `close` and `setTheme` are stable enough for a list rebuilt on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collections, globals, theme, user, admin])

  // Filter and rank the static items; document hits come from the server search. With a query,
  // the group holding the best match comes first, so Enter runs the most likely command.
  const visible = useMemo(() => {
    const trimmed = query.trim()
    const scored = items
      .filter((item) => (trimmed ? item.group !== 'Recent' : true))
      .map((item) => ({ item, score: matchScore(trimmed, item.label, item.keywords) }))
      .filter(({ score }) => score > 0)
    const documents = search.hits.map((hit) => ({
      item: {
        id: `doc:${hit.slug}:${hit.id}`,
        group: 'Documents' as const,
        label: hit.title,
        hint: searchable.find((entry) => entry.slug === hit.slug)?.label,
        icon: <FileTextIcon aria-hidden />,
        run: () => go(`${admin}/collections/${hit.slug}/${hit.id}`),
      },
      // Server matches every word; rank them like a word-start match on the title.
      score: Math.max(matchScore(trimmed, hit.title), 2),
    }))
    const all = [...scored, ...documents]
    const best = (group: Group) =>
      Math.max(0, ...all.filter(({ item }) => item.group === group).map(({ score }) => score))
    const groups = trimmed
      ? [...GROUPS].sort((a, b) => best(b) - best(a) || GROUPS.indexOf(a) - GROUPS.indexOf(b))
      : GROUPS
    return groups.flatMap((group) =>
      all
        .filter(({ item }) => item.group === group)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, search.hits, searchable, admin])

  // Render groups in the same order as `visible`, so arrow keys follow what is on screen.
  const groupOrder = [...new Set(visible.map((item) => item.group))]

  const active = Math.min(activeIndex, Math.max(visible.length - 1, 0))
  const optionId = (index: number) => `${listId}-option-${index}`

  useEffect(() => {
    listRef.current
      ?.querySelector(`[id="${optionId(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const last = visible.length - 1
    if (event.key === 'ArrowDown') setActiveIndex(active >= last ? 0 : active + 1)
    else if (event.key === 'ArrowUp') setActiveIndex(active <= 0 ? last : active - 1)
    else if (event.key === 'Home' && event.ctrlKey) setActiveIndex(0)
    else if (event.key === 'End' && event.ctrlKey) setActiveIndex(last)
    else if (event.key === 'Enter') visible[active]?.run()
    else return
    event.preventDefault()
  }

  let index = -1
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setQuery('')
          setActiveIndex(0)
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="acn:fixed acn:inset-0 acn:z-[80] acn:bg-black/30 acn:supports-backdrop-filter:backdrop-blur-xs acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-closed:animate-out acn:data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          data-testid="command-menu"
          // Phones: at the top of the screen, above the on-screen keyboard (see useVisibleHeight).
          style={
            visibleViewportHeight
              ? ({ '--command-vh': `${visibleViewportHeight}px` } as CSSProperties)
              : undefined
          }
          className="acn:fixed acn:top-[12vh] acn:left-1/2 acn:z-[81] acn:flex acn:max-h-[min(70vh,calc(var(--command-vh,100dvh)-12vh-1rem))] acn:w-[min(40rem,calc(100vw-2rem))] acn:-translate-x-1/2 acn:flex-col acn:overflow-hidden acn:rounded-xl acn:border acn:border-border acn:bg-popover acn:text-popover-foreground acn:shadow-2xl acn:outline-none acn:max-sm:top-2 acn:max-sm:max-h-[calc(var(--command-vh,100dvh)-1rem)] acn:max-sm:w-[calc(100vw-1rem)] acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95 acn:data-closed:animate-out acn:data-closed:fade-out-0 acn:data-closed:zoom-out-95"
        >
          <DialogPrimitive.Title className="acn:sr-only">Command menu</DialogPrimitive.Title>
          <div className="acn:flex acn:items-center acn:gap-3 acn:border-b acn:border-border acn:px-4">
            {search.loading ? (
              <LoaderCircleIcon
                aria-hidden
                className="acn:size-4 acn:shrink-0 acn:animate-spin acn:text-muted-foreground"
              />
            ) : (
              <SearchIcon
                aria-hidden
                className="acn:size-4 acn:shrink-0 acn:text-muted-foreground"
              />
            )}
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={visible.length ? optionId(active) : undefined}
              aria-label="Search pages, documents and actions"
              placeholder="Search pages, documents and actions…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={onKeyDown}
              className="acn:h-14 acn:w-full acn:border-0 acn:bg-transparent acn:text-base acn:text-foreground acn:outline-none acn:placeholder:text-muted-foreground"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Results"
            className="acn:overflow-y-auto acn:overscroll-contain acn:p-2"
          >
            {visible.length === 0 ? (
              <p
                role="status"
                className="acn:px-3 acn:py-8 acn:text-center acn:text-sm acn:text-muted-foreground"
              >
                {search.loading ? 'Searching…' : `No results for “${query.trim()}”.`}
              </p>
            ) : (
              groupOrder.map((group) => {
                const groupItems = visible.filter((item) => item.group === group)
                const headingId = `${listId}-${group.replace(/\s/g, '-')}`
                return (
                  <div
                    key={group}
                    role="group"
                    aria-labelledby={headingId}
                    className="acn:mb-2 acn:last:mb-0"
                  >
                    <div
                      id={headingId}
                      className="acn:px-3 acn:pt-2 acn:pb-1 acn:text-xs acn:font-medium acn:text-muted-foreground"
                    >
                      {group}
                    </div>
                    {groupItems.map((item) => {
                      index += 1
                      const itemIndex = index
                      const selected = itemIndex === active
                      return (
                        <div
                          key={item.id}
                          id={optionId(itemIndex)}
                          role="option"
                          aria-selected={selected}
                          data-active={selected || undefined}
                          onPointerMove={() => !selected && setActiveIndex(itemIndex)}
                          onClick={item.run}
                          className={cn(
                            'acn:flex acn:h-10 acn:cursor-pointer acn:items-center acn:gap-3 acn:rounded-lg acn:px-3 acn:text-sm acn:select-none acn:[&_svg]:size-4 acn:[&_svg]:shrink-0 acn:[&_svg]:text-muted-foreground',
                            selected && 'acn:bg-accent acn:text-accent-foreground',
                          )}
                        >
                          {item.icon}
                          <span className="acn:truncate">{item.label}</span>
                          {item.hint ? (
                            <span className="acn:ml-auto acn:shrink-0 acn:text-xs acn:text-muted-foreground">
                              {item.hint}
                            </span>
                          ) : null}
                          {selected ? (
                            <CornerDownLeftIcon
                              aria-hidden
                              className={cn(
                                !item.hint && 'acn:ml-auto',
                                'acn:pointer-coarse:hidden',
                              )}
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
          <div
            data-testid="command-menu-hints"
            // Keyboard hints mean nothing on touch screens.
            className="acn:flex acn:items-center acn:gap-4 acn:border-t acn:border-border acn:px-4 acn:py-2 acn:text-xs acn:text-muted-foreground acn:pointer-coarse:hidden"
          >
            <span>
              <kbd className="acn:font-sans">↑↓</kbd> to move
            </span>
            <span>
              <kbd className="acn:font-sans">↵</kbd> to open
            </span>
            <span>
              <kbd className="acn:font-sans">Esc</kbd> to close
            </span>
            <span className="acn:ml-auto">Type 2+ letters to search documents</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Title search across collections (REST, the user's own access): `like` on each collection's
 * `useAsTitle` field, four hits per collection, debounced, stale requests aborted.
 */
function useDocumentSearch(query: string, collections: Searchable[], apiURL: string) {
  const term = query.trim()
  const [state, setState] = useState<{ term: string; hits: SearchHit[] }>({ term: '', hits: [] })

  useEffect(() => {
    if (term.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const results = await Promise.all(
        collections.map(async ({ slug, titleField }) => {
          const params = new URLSearchParams({
            limit: '4',
            depth: '0',
            [`where[${titleField}][like]`]: term,
            [`select[${titleField}]`]: 'true',
          })
          try {
            const res = await fetch(`${apiURL}/${slug}?${params}`, {
              credentials: 'include',
              signal: controller.signal,
            })
            if (!res.ok) return []
            const { docs } = (await res.json()) as { docs: Record<string, unknown>[] }
            return docs.map<SearchHit>((doc) => ({
              slug,
              id: doc.id as number | string,
              title: String(doc[titleField] || `#${String(doc.id)}`),
            }))
          } catch {
            return []
          }
        }),
      )
      if (!controller.signal.aborted) setState({ term, hits: results.flat() })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [term, collections, apiURL])

  const current = term.length >= 2 && state.term === term
  return { hits: current ? state.hits : [], loading: term.length >= 2 && !current }
}

/**
 * Keyboard shortcuts help (`?`, or "Keyboard shortcuts" in the command menu), with the switch for
 * single-key shortcuts (WCAG 2.1.4).
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  mac,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mac: boolean
}) {
  const { visibleEntities } = useEntityVisibility()
  const [enabled, setEnabled] = useState(keyShortcutsEnabled)
  const mod = mac ? '⌘' : 'Ctrl'
  const rows: [string[], string][] = [
    [[mod, 'K'], 'Open the command menu'],
    [['/'], 'Open the command menu'],
    [['?'], 'Show these shortcuts'],
    ...GO_SHORTCUTS.filter(
      (shortcut) => !shortcut.target || visibleEntities.collections.includes(shortcut.target),
    ).map<[string[], string]>((shortcut) => [
      ['G', shortcut.key.toUpperCase()],
      `Go to ${shortcut.label}`,
    ]),
    [[mod, 'S'], 'Save the document (Payload)'],
  ]
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="acn:fixed acn:inset-0 acn:z-[80] acn:bg-black/30 acn:supports-backdrop-filter:backdrop-blur-xs acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-closed:animate-out acn:data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          data-testid="shortcuts-dialog"
          className="acn:fixed acn:top-[12vh] acn:left-1/2 acn:z-[81] acn:flex acn:max-h-[76vh] acn:w-[min(28rem,calc(100vw-2rem))] acn:-translate-x-1/2 acn:flex-col acn:gap-4 acn:overflow-y-auto acn:rounded-xl acn:border acn:border-border acn:bg-popover acn:p-6 acn:text-popover-foreground acn:shadow-2xl acn:outline-none acn:data-open:animate-in acn:data-open:fade-in-0 acn:data-open:zoom-in-95"
        >
          <DialogPrimitive.Title className="acn:text-lg acn:font-semibold">
            Keyboard shortcuts
          </DialogPrimitive.Title>
          <dl className="acn:grid acn:grid-cols-[1fr_auto] acn:gap-x-6 acn:gap-y-2 acn:text-sm">
            {rows.map(([keys, label]) => (
              <React.Fragment key={label + keys.join('')}>
                <dt className="acn:text-muted-foreground">{label}</dt>
                <dd className="acn:flex acn:items-center acn:gap-1">
                  {keys.map((key, index) => (
                    <React.Fragment key={key + index}>
                      {index > 0 && keys[0] === 'G' ? (
                        <span className="acn:text-xs acn:text-muted-foreground">then</span>
                      ) : null}
                      <kbd className="acn:min-w-6 acn:rounded acn:border acn:border-border acn:bg-muted acn:px-1.5 acn:text-center acn:font-sans acn:text-xs">
                        {key}
                      </kbd>
                    </React.Fragment>
                  ))}
                </dd>
              </React.Fragment>
            ))}
          </dl>
          <label className="acn:flex acn:items-center acn:gap-2 acn:border-t acn:border-border acn:pt-4 acn:text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked)
                setKeyShortcutsEnabled(event.target.checked)
              }}
            />
            Single-key shortcuts (/, ?, G then a letter)
          </label>
          <DialogPrimitive.Close className="acn:self-end acn:rounded-md acn:border acn:border-border acn:px-3 acn:py-1.5 acn:text-sm acn:hover:bg-muted">
            Close
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
