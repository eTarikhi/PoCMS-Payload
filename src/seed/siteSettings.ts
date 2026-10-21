import type { SiteSetting } from '@/payload-types'

import { siteSeoDefaults } from '@/plugins/seo'

/**
 * Site settings start online: maintenance off, with the same support address the footer shows.
 * An editor flips the switch in /admin → Site settings → Site settings.
 */
export const siteSettingsData = (): Omit<SiteSetting, 'id' | 'globalType'> => ({
  siteName: 'eTarikhi',
  // Site-wide SEO defaults (Payload's SEO plugin group). The layout keeps its constants when a
  // field is empty; the seed fills the same values the constants carry.
  meta: siteSeoDefaults({ siteName: 'eTarikhi' }),
  supportEmail: 'etarikhi@gmail.com',
  maintenance: {
    enabled: false,
    title: 'Back soon',
    message:
      'The site is being updated. Everything will be back shortly — thanks for your patience.',
  },
})
