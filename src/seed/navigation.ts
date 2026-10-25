import type { Navigation } from '@/payload-types'

export const navigationData = (): Omit<
  Navigation,
  'id' | 'createdAt' | 'updatedAt' | 'globalType'
> => ({
  brand: {
    text: 'eTarikhi',
    href: '/',
  },
  skipToContentLabel: 'Skip to content',
  items: [
    { label: 'Home', href: '/#home', position: 'left', openInNewTab: false, enabled: true },
    { label: 'About', href: '/#about', position: 'left', openInNewTab: false, enabled: true },
    { label: 'Skills', href: '/#skill', position: 'left', openInNewTab: false, enabled: true },
    { label: 'Services', href: '/#service', position: 'right', openInNewTab: false, enabled: true },
    { label: 'Projects', href: '/#project', position: 'right', openInNewTab: false, enabled: true },
    { label: 'Contact', href: '/#contact', position: 'right', openInNewTab: false, enabled: true },
  ],
})
