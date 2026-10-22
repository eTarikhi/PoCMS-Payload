'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Preserve the original navigation markup and scroll-triggered appearance.
// React controls the mobile collapse so it also works before Bootstrap finishes loading.

export function Navigation() {
  const [isVisible, setIsVisible] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  // The bar gets the extra `d-flex` class once the page is scrolled past 300px.
  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 300)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      aria-label="Portfolio navigation"
      className={`navbar navbar-expand-lg bg-dark navbar-dark fixed-top shadow py-lg-0 px-4 px-lg-5 wow fadeIn ${isVisible ? 'd-flex' : ''}`}
      data-wow-delay="0.1s"
    >
      <Link href="/" className="navbar-brand d-block d-lg-none">
        <h2 className="h1 text-primary fw-bold m-0">eTarikhi</h2>
      </Link>
      <button
        type="button"
        className="navbar-toggler"
        aria-label="Toggle navigation"
        aria-controls="navbarCollapse"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="navbar-toggler-icon"></span>
      </button>
      <div
        className={`collapse navbar-collapse justify-content-between py-4 py-lg-0${menuOpen ? ' show' : ''}`}
        id="navbarCollapse"
      >
        <div className="navbar-nav ms-auto py-0">
          <Link href="/#home" className="nav-item text-light nav-link active" onClick={closeMenu}>
            Home
          </Link>
          <Link href="/#about" className="nav-item text-light nav-link" onClick={closeMenu}>
            About
          </Link>
          <Link href="/#skill" className="nav-item text-light nav-link" onClick={closeMenu}>
            Skills
          </Link>
        </div>
        <Link href="/" className="navbar-brand bg-primary py-3 px-4 mx-3 d-none d-lg-block">
          <h2 className="h1 text-white fw-bold m-0">eTarikhi</h2>
        </Link>
        <div className="navbar-nav me-auto py-0">
          <Link href="/#service" className="nav-item text-light nav-link" onClick={closeMenu}>
            Services
          </Link>
          <Link href="/#project" className="nav-item text-light nav-link" onClick={closeMenu}>
            Projects
          </Link>
          <Link href="/blog" className="nav-item text-light nav-link" onClick={closeMenu}>
            Blog
          </Link>
          <Link href="/#contact" className="nav-item text-light nav-link" onClick={closeMenu}>
            Contact
          </Link>
        </div>
      </div>
    </nav>
  )
}
