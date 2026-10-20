import type { Navigation } from '@/payload-types'

/**
 * The top bar as the original vTarikhi site had it. Same order and anchors as
 * `vTarikhi/components/navigation.jsx`; `mapNavigation()` keeps these links as the fallback when the
 * global was never saved, so the seed and the fallback must not drift apart (unit test).
 */
export const navigationData = (): Omit<Navigation, 'id' | 'globalType'> => ({
  brand: 'eTarikhi',
  primaryLinks: [
    { label: 'Home', href: '/#home', newTab: false },
    { label: 'About', href: '/#about', newTab: false },
    { label: 'Skills', href: '/#skill', newTab: false },
  ],
  secondaryLinks: [
    { label: 'Services', href: '/#service', newTab: false },
    { label: 'Projects', href: '/#project', newTab: false },
    { label: 'Contact', href: '/#contact', newTab: false },
  ],
})
