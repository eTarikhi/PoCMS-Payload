import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCode,
  faCodeBranch,
  faCropAlt,
  faEnvelope,
  faGem,
  faHome,
  faLaptopCode,
  faPhoneFlip,
} from '@fortawesome/free-solid-svg-icons'
import {
  faFacebookF,
  faGithub,
  faInstagram,
  faLinkedin,
  faWhatsapp,
  faXTwitter,
} from '@fortawesome/free-brands-svg-icons'

/**
 * Icon maps from `vTarikhi/components/sections/services.tsx` and `footer.tsx`.
 *
 * The keys are the values stored in the CMS (`iconFont`, `iconName`), so existing content keeps resolving.
 * The icons are server-safe: react-fontawesome has no hooks, so server components can render them directly.
 */

export const serviceIcons: Record<string, ReactNode> = {
  faCode: <FontAwesomeIcon icon={faCode} className="fa fa-code fa-2x text-dark" />,
  faCropAlt: <FontAwesomeIcon icon={faCropAlt} className="fa fa-crop-alt fa-2x text-dark" />,
  faLaptopCode: (
    <FontAwesomeIcon icon={faLaptopCode} className="fa fa-laptop-code fa-2x text-dark" />
  ),
  faCodeBranch: (
    <FontAwesomeIcon icon={faCodeBranch} className="fa fa-code-branch fa-2x text-dark" />
  ),
}

export const footerIcons: Record<string, ReactNode> = {
  faFacebookF: (
    <FontAwesomeIcon icon={faFacebookF} className="fab fa-facebook-f" aria-hidden="true" />
  ),
  faXTwitter: <FontAwesomeIcon icon={faXTwitter} className="fab fa-twitter" aria-hidden="true" />,
  faInstagram: (
    <FontAwesomeIcon icon={faInstagram} className="fab fa-instagram" aria-hidden="true" />
  ),
  faLinkedin: <FontAwesomeIcon icon={faLinkedin} className="fab fa-linkedin" aria-hidden="true" />,
  faGithub: <FontAwesomeIcon icon={faGithub} className="fab fa-github" aria-hidden="true" />,
  faWhatsapp: <FontAwesomeIcon icon={faWhatsapp} className="fab fa-whatsapp" aria-hidden="true" />,
  faWhatsappc: (
    <FontAwesomeIcon
      icon={faWhatsapp}
      className="fab fa-whatsapp me-3 text-secondary"
      aria-hidden="true"
    />
  ),
  faGem: (
    <FontAwesomeIcon icon={faGem} className="fas fa-gem me-3 text-secondary" aria-hidden="true" />
  ),
  faHome: (
    <FontAwesomeIcon icon={faHome} className="fas fa-home me-3 text-secondary" aria-hidden="true" />
  ),
  faEnvelope: (
    <FontAwesomeIcon
      icon={faEnvelope}
      className="fas fa-envelope me-3 text-secondary"
      aria-hidden="true"
    />
  ),
  faPhoneFlip: (
    <FontAwesomeIcon
      icon={faPhoneFlip}
      className="fas fa-phone me-3 text-secondary"
      aria-hidden="true"
    />
  ),
}

// Own-property lookup only, so a key such as "constructor" cannot return an Object.prototype member.
const lookup = (icons: Record<string, ReactNode>, key: string): ReactNode =>
  Object.prototype.hasOwnProperty.call(icons, key) ? icons[key] : null

export const getServiceIcon = (key: string): ReactNode => lookup(serviceIcons, key)

export const getFooterIcon = (key: string): ReactNode => lookup(footerIcons, key)
