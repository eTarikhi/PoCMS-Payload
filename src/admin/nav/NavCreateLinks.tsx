'use client'

import React, { useEffect } from 'react'

/**
 * Adds a small create/open shortcut beside each Payload collection/global nav
 * item while retaining Payload's native Nav, route links, groups, and state.
 * Globals are singletons, so their shortcut opens the global editor; collection
 * shortcuts go directly to Payload's standard create route.
 */
export const NavCreateLinks: React.FC = () => {
  useEffect(() => {
    const navScroll = document.querySelector('.nav__scroll')

    if (!navScroll) {
      return
    }

    const decorateLinks = () => {
      const links = navScroll.querySelectorAll<HTMLAnchorElement>(
        'a.nav__link[id^="nav-"]',
      )

      links.forEach((navLink) => {
        if (navLink.closest('.pocms-nav-item-row')) {
          return
        }

        const rawHref = navLink.getAttribute('href')

        if (!rawHref) {
          return
        }

        const target = new URL(rawHref, window.location.origin)
        const cleanPath = target.pathname.replace(/\/+$/, '')
        const isCollection = /\/collections\/[^/]+$/.test(cleanPath)
        const isGlobal = /\/globals\/[^/]+$/.test(cleanPath)

        if (!isCollection && !isGlobal) {
          return
        }

        const label =
          navLink.querySelector('.nav__link-label')?.textContent?.trim() ||
          navLink.textContent?.trim() ||
          (isGlobal ? 'global' : 'collection')
        const actionLabel = isGlobal ? `Open ${label} global settings` : `Create ${label}`
        const shortcut = document.createElement('a')

        if (isCollection) {
          target.pathname = `${cleanPath}/create`
        }

        shortcut.className = 'pocms-nav-create'
        shortcut.href = `${target.pathname}${target.search}${target.hash}`
        shortcut.setAttribute('aria-label', actionLabel)
        shortcut.setAttribute('title', actionLabel)
        shortcut.textContent = '+'

        const row = document.createElement('div')
        row.className = 'pocms-nav-item-row'

        const parent = navLink.parentElement

        if (!parent) {
          return
        }

        parent.insertBefore(row, navLink)
        row.append(navLink, shortcut)
      })
    }

    decorateLinks()

    const observer = new MutationObserver(decorateLinks)
    observer.observe(navScroll, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return null
}

export default NavCreateLinks
