import Link from 'next/link'
import type { ReactNode } from 'react'
import type { FooterContent, HeaderContent } from '../../lib/types'

/** The journal/work extension of the owner's original charcoal-and-amber portfolio. */
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
  active?: 'work' | 'writing' | 'blog'
}) {
  const displayName = name || footer?.fullName || 'Portfolio'
  return (
    <div className="studio amber-journal" id="page-top">
      <a className="studio-skip" href="#main-content">
        Skip to content
      </a>
      <header className="studio-nav studio-container">
        <Link className="studio-brand" href="/">
          <span className="journal-brand-mark" aria-hidden="true">
            e
          </span>
          <span>
            {displayName}
            <small>Portfolio / Journal</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/blog" aria-current={active === 'blog' ? 'page' : undefined}>
            Blog
          </Link>
          <Link href="/articles" aria-current={active === 'writing' ? 'page' : undefined}>
            Articles
          </Link>
          <Link href="/projects" aria-current={active === 'work' ? 'page' : undefined}>
            Projects
          </Link>
        </nav>
        <Link className="studio-nav-cta" href="/#contact">
          Let’s talk <span aria-hidden="true">↗</span>
        </Link>
      </header>
      {children}
      <footer className="studio-footer studio-container">
        <div className="journal-footer-heading">
          <p>
            Ideas into words.
            <br />
            <em>Ideas into work.</em>
          </p>
          <Link href="/#contact">Start a conversation ↗</Link>
        </div>
        <div className="journal-footer-bottom">
          <p>
            © {new Date().getFullYear()} {footer?.copyright.website || displayName}
          </p>
          <div>
            <Link href="/">Back to portfolio</Link>
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
        </div>
      </footer>
    </div>
  )
}
