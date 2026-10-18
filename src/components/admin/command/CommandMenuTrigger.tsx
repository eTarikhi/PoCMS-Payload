'use client'

import { useConfig, useEntityVisibility } from '@payloadcms/ui'
import { SearchIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '../lib/utils'
import { buttonVariants } from '../ui/button'
import { parseDocumentPath, rememberRecent } from './recent'
import { GO_SHORTCUTS, isTypingTarget, keyShortcutsEnabled } from './shortcuts'

// The menu itself (search, lists, dialog) is a separate chunk, loaded on first use.
const loadMenu = () => import('./CommandMenu')
const CommandMenu = dynamic(loadMenu, { ssr: false })
const ShortcutsDialog = dynamic(() => loadMenu().then((mod) => mod.ShortcutsDialog), { ssr: false })

const noopSubscribe = () => () => {}
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Header action: opens the command menu (also Ctrl+K / Cmd+K anywhere in the admin), handles the
 * single-key shortcuts (`/`, `?`, `G then …`) and records recently opened documents. Only this small
 * component is part of every admin page; the menu and the shortcuts help load on first use.
 */
export function CommandMenuTrigger() {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const mac = useSyncExternalStore(noopSubscribe, isMac, () => false)
  const router = useRouter()
  const { config } = useConfig()
  const { visibleEntities } = useEntityVisibility()
  useRecentDocuments()

  useEffect(() => {
    let pendingG = 0
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setMounted(true)
        setOpen((value) => !value)
        return
      }
      // Single-key shortcuts: off while typing, inside dialogs, or when the user turned them off.
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (isTypingTarget(event.target) || document.querySelector('[role="dialog"]')) return
      if (!keyShortcutsEnabled()) return
      const key = event.key.toLowerCase()
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0
        const shortcut = GO_SHORTCUTS.find((entry) => entry.key === key)
        const visible = shortcut?.target
          ? visibleEntities.collections.includes(shortcut.target)
          : Boolean(shortcut)
        if (shortcut && visible) {
          event.preventDefault()
          const admin = config.routes.admin
          router.push(shortcut.target ? `${admin}/collections/${shortcut.target}` : admin)
        }
        return
      }
      if (key === 'g') pendingG = Date.now()
      else if (key === '/') {
        event.preventDefault()
        setMounted(true)
        setOpen(true)
      } else if (event.key === '?') {
        event.preventDefault()
        setMounted(true)
        setHelpOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visibleEntities.collections, config.routes.admin, router])

  return (
    <>
      <button
        type="button"
        data-slot="button"
        data-testid="command-menu-trigger"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        onPointerEnter={() => void loadMenu()}
        onFocus={() => void loadMenu()}
        onClick={() => {
          setMounted(true)
          setOpen(true)
        }}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'acn:w-9 acn:justify-center acn:gap-2 acn:rounded-full acn:px-0 acn:font-normal acn:whitespace-nowrap acn:text-muted-foreground acn:sm:w-44 acn:sm:justify-start acn:sm:px-3',
        )}
      >
        <SearchIcon aria-hidden />
        <span className="acn:sr-only acn:sm:not-sr-only">Search…</span>
        <kbd className="acn:ml-auto acn:hidden acn:rounded acn:border acn:border-border acn:px-1.5 acn:font-sans acn:text-xs acn:sm:inline acn:pointer-coarse:hidden">
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {mounted ? (
        <>
          <CommandMenu
            open={open}
            onOpenChange={setOpen}
            onShowShortcuts={() => {
              setOpen(false)
              setHelpOpen(true)
            }}
          />
          <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} mac={mac} />
        </>
      ) : null}
    </>
  )
}

/** The document title as Payload renders it in the edit view header (`RenderTitle`). */
const readTitle = () => document.querySelector('.render-title')?.textContent?.trim() ?? ''

/**
 * Remembers documents and globals the user opens. The page title is generic ("Editing - Article"),
 * so the name comes from the edit view's heading. On client navigation the old heading stays until
 * the new page renders: wait for it to change (a full page load already has the right one).
 */
function useRecentDocuments() {
  const pathname = usePathname()
  const { config } = useConfig()
  const firstRun = useRef(true)
  useEffect(() => {
    const previousTitle = firstRun.current ? null : readTitle()
    firstRun.current = false
    const match = parseDocumentPath(pathname, config.routes.admin)
    if (!match) return
    const observer = new MutationObserver(() => record())
    const record = () => {
      const title = readTitle()
      if (!title || title === previousTitle) return
      observer.disconnect()
      rememberRecent({ ...match, path: pathname, title, at: Date.now() })
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    record()
    return () => observer.disconnect()
  }, [pathname, config.routes.admin])
}

export default CommandMenuTrigger
