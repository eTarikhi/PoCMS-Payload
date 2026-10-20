'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { NavLink, NavigationContent } from '@/app/(frontend)/lib/types'

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

/**
 * Renders one configured link. Internal links go through next/link (client-side navigation);
 * external ones use a plain anchor and get `rel` when they open a new tab.
 */
function NavItem({ link, active }: { link: NavLink; active?: boolean }) {
  const className = `nav-item text-light nav-link${active ? ' active' : ''}`
  if (link.newTab) {
    return (
      <a href={link.href} className={className} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    )
  }
  return (
    <Link href={link.href} className={className} onClick={hideNavbarCollapse}>
      {link.label}
    </Link>
  )
}

/**
 * The top bar. Links and the brand come from the Navigation global (`mapNavigation` falls back to
 * the original vTarikhi links, so the bar is never empty). The brand sits between the two link
 * groups on wide screens.
 */
export function Navigation({ navigation }: { navigation: NavigationContent }) {
  const [isVisible, setIsVisible] = useState(false)

  // The bar gets the extra `d-flex` class once the page is scrolled past 300px.
  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className={`navbar navbar-expand-lg bg-dark navbar-dark fixed-top shadow py-lg-0 px-4 px-lg-5 wow fadeIn ${isVisible ? 'd-flex' : ''}`}
      data-wow-delay="0.1s"
    >
      <Link href="/" className="navbar-brand d-block d-lg-none">
        <h2 className="h1 text-primary fw-bold m-0">{navigation.brand}</h2>
      </Link>
      <button
        type="button"
        className="navbar-toggler"
        onClick={hideNavbarCollapse}
        aria-label="Toggle navigation"
      >
        <span className="navbar-toggler-icon"></span>
      </button>
      <div
        className="collapse navbar-collapse justify-content-between py-4 py-lg-0"
        id="navbarCollapse"
      >
        <div className="navbar-nav ms-auto py-0">
          {navigation.primaryLinks.map((link) => (
            <NavItem key={`${link.href}-${link.label}`} link={link} active={link.href === '/#home'} />
          ))}
        </div>
        <Link href="/" className="navbar-brand bg-primary py-3 px-4 mx-3 d-none d-lg-block">
          <h2 className="h1 text-white fw-bold m-0">{navigation.brand}</h2>
        </Link>
        <div className="navbar-nav me-auto py-0">
          {navigation.secondaryLinks.map((link) => (
            <NavItem key={`${link.href}-${link.label}`} link={link} />
          ))}
        </div>
      </div>
    </nav>
  )
}
