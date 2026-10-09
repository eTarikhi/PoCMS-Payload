import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGem } from '@fortawesome/free-solid-svg-icons'

import type { FooterContent } from '@/lib/portfolio/types'
import { getFooterIcon } from '../icons'
import { EmailReveal } from '../ui/EmailReveal'

// Ported from vTarikhi/components/footer.tsx. The copyright year comes from the CMS (D-6).
// The original computed currentYear but never used it, so it is not ported.

export type FooterProps = {
  footer: FooterContent
}

export function Footer({ footer }: FooterProps) {
  return (
    <footer className="text-center text-lg-start bg-dark text-white">
      {/* Section: Social media */}
      <section>
        <div className="container d-flex justify-content-center justify-content-lg-between p-4">
          {/* Left */}
          <div className="me-5 d-none d-lg-block">
            <span>Get connected with me on social networks:</span>
          </div>
          {/* Right */}
          <div className="ml-4">
            {footer.socialLinks.map((social, index) => (
              <Link
                key={index}
                href={social.url}
                target="_blank"
                aria-label={social.ariaLabel}
                className="me-4 link-secondary"
                title={social.ariaLabel}
              >
                {getFooterIcon(social.iconName)}
              </Link>
            ))}{' '}
          </div>
        </div>
      </section>

      {/* Section: Links */}
      <section>
        <div className="container text-center text-md-start px-md-4 mt-5">
          <div className="row mt-3">
            {/* Personal Info Column */}
            <aside className="col-md-5 mx-auto mb-4">
              <h2 className="h6 text-uppercase fw-bold mb-4">
                <FontAwesomeIcon
                  icon={faGem}
                  className="fas fa-gem me-3 text-secondary"
                  aria-hidden="true"
                />
                <span className="text-secondary">{footer.fullName} </span>
              </h2>
              <ul>
                {footer.roles.map((role, index) => (
                  <li key={index}>{role}</li>
                ))}
              </ul>
            </aside>

            {/* Profiles Column */}
            <nav className="col-md-4 mx-auto mb-4">
              <h2 className="h6 text-uppercase fw-bold mb-4">My Profiles</h2>
              {footer.profiles.map((profile, index) => (
                <p key={index}>
                  <Link
                    href={profile.url}
                    title={profile.name}
                    target="_blank"
                    className="text-reset"
                  >
                    {profile.name}
                  </Link>
                </p>
              ))}
            </nav>

            {/* Contact Column */}
            <nav className="col-md-3 mx-auto mb-md-0 mb-4" id="contact">
              <h2 className="h6 text-uppercase fw-bold mb-4">Contact</h2>
              {footer.contactInfo.map((contact, index) => (
                <p key={index}>
                  {getFooterIcon(contact.iconName)}
                  {contact.type === 'email' ? (
                    <EmailReveal email={contact.content} className={contact.className} />
                  ) : contact.isLink ? (
                    <Link
                      className={contact.className}
                      href={contact.url || '#'}
                      title={contact.type}
                      target="_blank"
                    >
                      {contact.content}
                    </Link>
                  ) : (
                    contact.content
                  )}
                </p>
              ))}
            </nav>
          </div>
        </div>
      </section>

      {/* Copyright */}
      <div className="text-center p-3" style={{ backgroundColor: '#0e1017', fontSize: 'smaller' }}>
        Copyright © {footer.copyright.year}{' '}
        <Link className="text-white" href={footer.copyright.url}>
          {footer.copyright.website}{' '}
        </Link>
        , All Rights Reserved.
      </div>
    </footer>
  )
}
