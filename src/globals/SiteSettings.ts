import type { GlobalConfig } from 'payload'

import { globalAccess, hiddenWithout } from '../access/roles'
import { portfolioAfterChange } from '../app/(frontend)/lib/hooks'

/**
 * Site-wide switches and identity (roadmap P3.4 / CNT; idea 12 in dashboard-integrations.md).
 *
 * Today it holds the maintenance switch the public layout reads, plus the support address shown on
 * that page. The global was an empty 0-byte file until now, and a placeholder with no consumer is
 * worse than no file, so everything here is read somewhere:
 *
 * - `maintenance.*` → `components/layout/MaintenancePage.tsx`, rendered by the frontend layout in
 *   place of the page content. /admin and the REST API stay reachable, so an editor can switch it
 *   off again.
 * - `supportEmail` → the maintenance page's contact link.
 * - `siteName` → the maintenance page heading and its tab title.
 *
 * The layout caches this read under the `portfolio` tag, so saving the global refreshes the public
 * site immediately (`portfolioAfterChange` → `revalidatePortfolio`).
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  hooks: {
    afterChange: [portfolioAfterChange],
  },
  admin: {
    group: 'Site settings',
    hidden: hiddenWithout('site-settings'),
    description: 'Site-wide switches: the maintenance page and the support address it shows.',
  },
  access: globalAccess('site-settings'),
  fields: [
    {
      name: 'siteName',
      type: 'text',
      defaultValue: 'eTarikhi',
      admin: { description: 'Used where the site has to name itself, e.g. the maintenance page.' },
    },
    {
      name: 'supportEmail',
      type: 'email',
      admin: {
        description: 'Shown as "Email us" on the maintenance page. Leave empty to hide the link.',
      },
    },
    {
      name: 'maintenance',
      type: 'group',
      label: 'Maintenance mode',
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: false,
          label: 'Show the maintenance page',
          admin: {
            description:
              'Replaces every public page. /admin keeps working, so switch it off here when done.',
          },
        },
        {
          name: 'title',
          type: 'text',
          defaultValue: 'Back soon',
          admin: { condition: (_, siblingData) => Boolean(siblingData?.enabled) },
        },
        {
          name: 'message',
          type: 'textarea',
          defaultValue:
            'The site is being updated. Everything will be back shortly — thanks for your patience.',
          admin: { condition: (_, siblingData) => Boolean(siblingData?.enabled) },
        },
      ],
    },
  ],
}

export default SiteSettings
