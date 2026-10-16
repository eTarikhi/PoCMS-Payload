'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { DEFAULT_LOCALE, localizePath, type Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

const hideNavbarCollapse = async () => {
  const navbarCollapse = document.getElementById('navbarCollapse')
  if (navbarCollapse) {
    const { Collapse } = await import('bootstrap')
    Collapse.getOrCreateInstance(navbarCollapse).hide()
  }
}

type NavigationProps = {
  currentPath: string
  locale: Locale
}

export function Navigation({ currentPath, locale }: NavigationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const messages = getMessages(locale)
  const homePath = localizePath(locale)
  const alternateLocale = locale === DEFAULT_LOCALE ? 'fa' : DEFAULT_LOCALE

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
      <Link href={homePath} className="navbar-brand d-block d-lg-none">
        <h2 className="h1 text-primary fw-bold m-0">eTarikhi</h2>
      </Link>
      <button type="button" className="navbar-toggler" onClick={hideNavbarCollapse}>
        <span className="navbar-toggler-icon"></span>
      </button>
      <div
        className="collapse navbar-collapse justify-content-between py-4 py-lg-0"
        id="navbarCollapse"
      >
        <div className="navbar-nav ms-auto py-0">
          <Link
            href={`${homePath}#home`}
            className="nav-item text-light nav-link active"
            onClick={hideNavbarCollapse}
          >
            {messages.navigation.home}
          </Link>
          <Link
            href={`${homePath}#about`}
            className="nav-item text-light nav-link"
            onClick={hideNavbarCollapse}
          >
            {messages.navigation.about}
          </Link>
          <Link
            href={`${homePath}#skill`}
            className="nav-item text-light nav-link"
            onClick={hideNavbarCollapse}
          >
            {messages.navigation.skills}
          </Link>
        </div>
        <Link href={homePath} className="navbar-brand bg-primary py-3 px-4 mx-3 d-none d-lg-block">
          <h2 className="h1 text-white fw-bold m-0">eTarikhi</h2>
        </Link>
        <div className="navbar-nav me-auto py-0">
          <Link
            href={`${homePath}#service`}
            className="nav-item text-light nav-link"
            onClick={hideNavbarCollapse}
          >
            {messages.navigation.services}
          </Link>
          <Link
            href={`${homePath}#project`}
            className="nav-item text-light nav-link"
            onClick={hideNavbarCollapse}
          >
            {messages.navigation.projects}
          </Link>
          <Link
            href={`${homePath}#contact`}
            className="nav-item text-light nav-link"
            onClick={hideNavbarCollapse}
          >
            {messages.navigation.contact}
          </Link>
          <Link
            href={localizePath(alternateLocale, currentPath)}
            className="nav-item text-secondary nav-link"
            aria-label={messages.language.label}
            onClick={hideNavbarCollapse}
          >
            {alternateLocale === DEFAULT_LOCALE
              ? messages.language.switchToEnglish
              : messages.language.switchToPersian}
          </Link>
        </div>
      </div>
    </nav>
  )
}
