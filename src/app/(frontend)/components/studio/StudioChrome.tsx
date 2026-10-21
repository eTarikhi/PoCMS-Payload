import Link from 'next/link'
import type { ReactNode } from 'react'
import type { FooterContent } from '../../lib/types'

/** Shared public shell. Hash links always target the homepage, including from article routes. */
export function StudioChrome({
  name,
  footer,
  children,
  active,
}: {
  name?: string
  footer: FooterContent | null
  children?: ReactNode
  active?: 'work' | 'writing'
}) {
  const displayName = name || footer?.fullName || 'Portfolio'
  return (
    <div className="studio" id="page-top">
      <a className="studio-skip" href="#main-content">
        Skip to content
      </a>
      <header className="studio-nav">
        <Link className="studio-brand" href="/">
          {displayName}
          <span aria-hidden="true">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/projects" aria-current={active === 'work' ? 'location' : undefined}>
            Work
          </Link>
          <Link href="/#service">Expertise</Link>
          <Link href="/articles" aria-current={active === 'writing' ? 'location' : undefined}>
            Writing
          </Link>
          <Link href="/#about">About</Link>
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
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer">
              {link.ariaLabel} ↗
            </a>
          ))}
          {footer?.profiles.map((profile, i) => (
            <a key={`profile-${i}`} href={profile.url} target="_blank" rel="noopener noreferrer">
              {profile.name} ↗
            </a>
          ))}
        </div>
        <a href="#page-top">Back to top ↑</a>
      </footer>
    </div>
  )
}
