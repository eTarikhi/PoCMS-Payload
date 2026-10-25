'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { DEFAULT_NAVIGATION } from '@/app/(frontend)/lib/mappers'
import type { NavigationContent, NavigationItem } from '@/app/(frontend)/lib/types'

// Ported from vTarikhi/components/navigation.jsx. The original called require('bootstrap') inside the handler.
// The Bootstrap module is loaded the same way (D-15). A module-scope import would run Bootstrap's `document`
// setup while the server prerenders the page, and that fails.

// Collapses the mobile menu. Called on every link click and on the toggler button (original handleLinkClick).
const hideNavbarCollapse = async () => {
  const navbarCollapse = document.getElementById('navbarCollapse')
  if (navbarCollapse) {
    const { Collapse } = await import('bootstrap')
    Collapse.getOrCreateInstance(navbarCollapse).hide()
  }
}

export type NavigationProps = {
  navigation?: NavigationContent
}

function NavLink({ item, isFirst }: { item: NavigationItem; isFirst: boolean }) {
  return (
    <Link
      href={item.href}
      className={`nav-item text-light nav-link${isFirst ? ' active' : ''}`}
      onClick={hideNavbarCollapse}
      {...(item.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {item.label}
    </Link>
  )
}

export function Navigation({ navigation = DEFAULT_NAVIGATION }: NavigationProps) {
  const [isVisible, setIsVisible] = useState(false)

  // The bar gets the extra `d-flex` class once the page is scrolled past 300px.
  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const leftItems = navigation.items.filter((item) => item.position === 'left')
  const rightItems = navigation.items.filter((item) => item.position === 'right')
  const firstId = navigation.items[0]?.id

  return (
    <nav
      className={`navbar navbar-expand-lg bg-dark navbar-dark fixed-top shadow py-lg-0 px-4 px-lg-5 wow fadeIn ${isVisible ? 'd-flex' : ''}`}
      data-wow-delay="0.1s"
    >
      <Link href={navigation.brand.href} className="navbar-brand d-block d-lg-none">
        <h2 className="h1 text-primary fw-bold m-0">{navigation.brand.text}</h2>
      </Link>
      <button type="button" className="navbar-toggler" onClick={hideNavbarCollapse}>
        <span className="navbar-toggler-icon"></span>
      </button>
      <div
        className="collapse navbar-collapse justify-content-between py-4 py-lg-0"
        id="navbarCollapse"
      >
        <div className="navbar-nav ms-auto py-0">
          {leftItems.map((item) => (
            <NavLink key={item.id} item={item} isFirst={item.id === firstId} />
          ))}
        </div>
        <Link
          href={navigation.brand.href}
          className="navbar-brand bg-primary py-3 px-4 mx-3 d-none d-lg-block"
        >
          <h2 className="h1 text-white fw-bold m-0">{navigation.brand.text}</h2>
        </Link>
        <div className="navbar-nav me-auto py-0">
          {rightItems.map((item) => (
            <NavLink key={item.id} item={item} isFirst={item.id === firstId} />
          ))}
        </div>
      </div>
    </nav>
  )
}
