import Link from 'next/link'
import type { ReactNode } from 'react'
import type { FooterContent, HeaderContent } from '../../lib/types'

/** Compact public navigation for the bento portfolio. */
export function StudioChrome({
  name,
  footer,
  children,
  active,
}: {
  name?: string
  footer: FooterContent | null
  profile?: HeaderContent | null
  children?: ReactNode
  active?: 'work' | 'writing'
}) {
  const displayName = name || footer?.fullName || 'Portfolio'
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
  return (
    <div className="studio bento" id="page-top">
      <a className="studio-skip" href="#main-content">
        Skip to content
      </a>
      <header className="studio-nav">
        <Link className="studio-brand" href="/">
          <span className="bento-monogram" aria-hidden="true">
            {initials}
          </span>
          {displayName}
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/#home">Overview</Link>
          <Link href="/projects" aria-current={active === 'work' ? 'page' : undefined}>
            Projects
          </Link>
          <Link href="/articles" aria-current={active === 'writing' ? 'page' : undefined}>
            Writing
          </Link>
        </nav>
        <Link className="studio-nav-cta" href="/#contact">
          Let’s talk <span aria-hidden="true">↗</span>
        </Link>
      </header>
      {children}
      <footer className="studio-footer studio-container">
        <p>
          © {new Date().getFullYear()} {footer?.copyright.website || displayName}
        </p>
        <div>
          <a href="/feed.xml">RSS feed</a>
          {footer?.socialLinks.map((link, i) => (
            <a key={`social-${i}`} href={link.url} target="_blank" rel="noopener noreferrer">
              {link.ariaLabel} ↗
            </a>
          ))}
          {footer?.profiles.map((link, i) => (
            <a key={`profile-${i}`} href={link.url} target="_blank" rel="noopener noreferrer">
              {link.name} ↗
            </a>
          ))}
          <a href="#page-top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  )
}
