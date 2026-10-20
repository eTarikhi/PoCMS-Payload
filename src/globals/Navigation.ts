import type { Field, GlobalConfig } from 'payload'

import { globalAccess, hiddenWithout } from '../access/roles'
import { portfolioAfterChange } from '../app/(frontend)/lib/hooks'

/**
 * The public navigation bar (roadmap P3.4 / CNT).
 *
 * The links used to be hard-coded in `components/layout/Navigation.tsx` — the original
 * `vTarikhi/components/navigation.jsx` had them inline too. Editors can now change them without a
 * deploy. The bar is split around the centred brand, so there are two lists: `primary` renders to
 * the left of the brand on large screens, `secondary` to the right.
 *
 * A global that was never saved returns empty arrays; `mapNavigation()` then falls back to the
 * original links so the site keeps its navigation on a fresh database.
 */

const linkFields: Field[] = [
  {
    name: 'label',
    type: 'text',
    required: true,
    admin: { description: 'The text shown in the bar. Keep it short: "About", "Projects".' },
  },
  {
    name: 'href',
    type: 'text',
    required: true,
    admin: {
      description: 'Where the link goes. A section on the home page is `/#about`, an article `/articles/slug`.',
    },
  },
  {
    name: 'newTab',
    type: 'checkbox',
    defaultValue: false,
    label: 'Open in a new tab',
    admin: { description: 'Only for links that leave the site.' },
  },
]

export const NavigationGlobal: GlobalConfig = {
  slug: 'navigation',
  label: 'Navigation',
  hooks: {
    afterChange: [portfolioAfterChange],
  },
  admin: {
    group: 'Site settings',
    hidden: hiddenWithout('navigation'),
    description: 'The links in the top bar. The bar is split around the brand in the middle.',
  },
  access: globalAccess('navigation'),
  fields: [
    {
      name: 'brand',
      type: 'text',
      defaultValue: 'eTarikhi',
      admin: {
        description: 'Brand text in the middle of the bar. Leave empty to keep the default.',
      },
    },
    {
      name: 'primaryLinks',
      type: 'array',
      labels: { singular: 'Left link', plural: 'Left links' },
      admin: { description: 'Shown left of the brand on wide screens, first in the mobile menu.' },
      fields: linkFields,
    },
    {
      name: 'secondaryLinks',
      type: 'array',
      labels: { singular: 'Right link', plural: 'Right links' },
      admin: { description: 'Shown right of the brand on wide screens.' },
      fields: linkFields,
    },
  ],
}

export default NavigationGlobal
