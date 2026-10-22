import Link from 'next/link'
import type { ReactNode } from 'react'
import type { FooterContent, HeaderContent } from '../../lib/types'
import { CoverImage } from '../ui/CoverImage'

/** A résumé-style sidebar shared by the public site only. */
export function StudioChrome({
  name,
  footer,
  profile,
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
    <div className="studio resume" id="page-top">
      <a className="studio-skip" href="#main-content">
        Skip to content
      </a>
      <header className="studio-nav">
        <div className="resume-identity">
          {profile?.imageUrl ? (
            <CoverImage
              src={profile.imageUrl}
              fallbackSrc="/placeholder.svg"
              alt={displayName}
              width={96}
              height={96}
              priority
              sizes="96px"
            />
          ) : (
            <span className="resume-initials" aria-hidden="true">
              {initials}
            </span>
          )}
          <Link className="studio-brand" href="/">
            {displayName}
          </Link>
          <p>{profile?.professionTexts[0] || footer?.roles[0] || 'Professional portfolio'}</p>
        </div>
        <p className="resume-nav-label">Résumé & portfolio</p>
        <nav aria-label="Main navigation">
          <Link href="/#home">
            <span aria-hidden="true">01</span> Overview
          </Link>
          <Link href="/#experience">
            <span aria-hidden="true">02</span> Experience
          </Link>
          <Link href="/#skill">
            <span aria-hidden="true">03</span> Skills
          </Link>
          <Link href="/projects" aria-current={active === 'work' ? 'page' : undefined}>
            <span aria-hidden="true">04</span> Projects
          </Link>
          <Link href="/#education">
            <span aria-hidden="true">05</span> Education
          </Link>
          <Link href="/articles" aria-current={active === 'writing' ? 'page' : undefined}>
            <span aria-hidden="true">06</span> Writing
          </Link>
        </nav>
        <div className="resume-sidebar-contact">
          {profile?.requestCV ? (
            <a className="resume-cv" href={profile.requestCV}>
              Request CV <span aria-hidden="true">↗</span>
            </a>
          ) : null}
          <Link className="studio-nav-cta" href="/#contact">
            Let’s talk <span aria-hidden="true">↗</span>
          </Link>
          <div className="resume-socials">
            {footer?.socialLinks.map((link, index) => (
              <a key={index} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.ariaLabel} <span aria-hidden="true">↗</span>
              </a>
            ))}
            {footer?.profiles.map((link, index) => (
              <a key={`profile-${index}`} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.name} <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </div>
      </header>
      {children}
      <footer className="studio-footer studio-container">
        <p>
          © {new Date().getFullYear()} {footer?.copyright.website || displayName}
        </p>
        <div>
          <a href="/feed.xml">RSS feed</a>
          <a href="#page-top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  )
}
