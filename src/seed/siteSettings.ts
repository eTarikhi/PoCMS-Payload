import type { SiteSetting } from '@/payload-types'

/**
 * Site settings start online: maintenance off, with the same support address the footer shows.
 * An editor flips the switch in /admin → Site settings → Site settings.
 */
export const siteSettingsData = (): Omit<SiteSetting, 'id' | 'globalType'> => ({
  siteName: 'eTarikhi',
  supportEmail: 'etarikhi@gmail.com',
  maintenance: {
    enabled: false,
    title: 'Back soon',
    message:
      'The site is being updated. Everything will be back shortly — thanks for your patience.',
  },
})
