import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGem } from '@fortawesome/free-solid-svg-icons'

import type { FooterContent } from '@/app/(frontend)/lib/types'
import type { Locale } from '@/i18n/locales'
import { getMessages } from '@/i18n/messages'

import { getFooterIcon } from '../icons'
import { EmailReveal } from '../ui/EmailReveal'

export type FooterProps = {
  footer: FooterContent
  locale: Locale
}

export function Footer({ footer, locale }: FooterProps) {
  const messages = getMessages(locale)

  return (
    <footer className="text-center text-lg-start bg-dark text-white">
      <section>
        <div className="container d-flex justify-content-center justify-content-lg-between p-4">
          <div className="me-5 d-none d-lg-block">
            <span>{messages.footer.socialIntro}</span>
          </div>
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

      <section>
        <div className="container text-center text-md-start px-md-4 mt-5">
          <div className="row mt-3">
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

            <nav className="col-md-4 mx-auto mb-4">
              <h2 className="h6 text-uppercase fw-bold mb-4">{messages.footer.myProfiles}</h2>
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

            <nav className="col-md-3 mx-auto mb-md-0 mb-4" id="contact">
              <h2 className="h6 text-uppercase fw-bold mb-4">{messages.footer.contact}</h2>
              {footer.contactInfo.map((contact, index) => (
                <p key={index}>
                  {getFooterIcon(contact.iconName)}
                  {contact.type === 'email' ? (
                    <EmailReveal
                      email={contact.content}
                      className={contact.className}
                      clickToEmail={messages.email.clickToEmail}
                      clickToReveal={messages.email.clickToReveal}
                    />
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

      <div className="text-center p-3" style={{ backgroundColor: '#0e1017', fontSize: 'smaller' }}>
        {messages.footer.copyright} © {footer.copyright.year}{' '}
        <Link className="text-white" href={footer.copyright.url}>
          {footer.copyright.website}{' '}
        </Link>
        , {messages.footer.allRightsReserved}
      </div>
    </footer>
  )
}
