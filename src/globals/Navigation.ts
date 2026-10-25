import type { GlobalConfig } from 'payload'

import { globalAccess, hiddenWithout } from '../access/roles'
import { portfolioAfterChange } from '../app/(frontend)/lib/hooks'

const DEFAULT_NAV_ITEMS = [
  { label: 'Home', href: '/#home', position: 'left' as const, openInNewTab: false, enabled: true },
  { label: 'About', href: '/#about', position: 'left' as const, openInNewTab: false, enabled: true },
  { label: 'Skills', href: '/#skill', position: 'left' as const, openInNewTab: false, enabled: true },
  {
    label: 'Services',
    href: '/#service',
    position: 'right' as const,
    openInNewTab: false,
    enabled: true,
  },
  {
    label: 'Projects',
    href: '/#project',
    position: 'right' as const,
    openInNewTab: false,
    enabled: true,
  },
  {
    label: 'Contact',
    href: '/#contact',
    position: 'right' as const,
    openInNewTab: false,
    enabled: true,
  },
]

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Navigation',
  hooks: {
    afterChange: [portfolioAfterChange],
  },
  admin: {
    hidden: hiddenWithout('navigation'),
    group: 'Site settings',
    description:
      'Top navigation bar: brand mark, skip-link text and drag-and-drop menu links shown across all public pages.',
  },
  access: globalAccess('navigation'),
  fields: [
    {
      name: 'brand',
      type: 'group',
      label: 'Brand mark',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'text',
              type: 'text',
              required: true,
              defaultValue: 'eTarikhi',
              admin: {
                width: '50%',
                description:
                  'Brand title shown in the mobile bar and centered in the desktop navigation.',
              },
            },
            {
              name: 'href',
              type: 'text',
              required: true,
              defaultValue: '/',
              admin: {
                width: '50%',
                description: 'Destination when clicking the brand mark (e.g. "/").',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'skipToContentLabel',
      type: 'text',
      defaultValue: 'Skip to content',
      admin: {
        description: 'Accessible keyboard skip-link label at the very top of every public page.',
      },
    },
    {
      name: 'items',
      type: 'array',
      label: 'Menu links',
      labels: {
        singular: 'Menu link',
        plural: 'Menu links',
      },
      defaultValue: DEFAULT_NAV_ITEMS,
      admin: {
        initCollapsed: false,
        description:
          'Drag rows to reorder links. Desktop places "Left of brand" links before the centered brand badge and "Right of brand" links after it; mobile lists all visible links in order.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'label',
              type: 'text',
              required: true,
              admin: { width: '35%', description: 'Link label shown in the navbar.' },
            },
            {
              name: 'href',
              type: 'text',
              required: true,
              admin: {
                width: '35%',
                description: 'Anchor or path (e.g. "/#about", "/articles", or external URL).',
              },
            },
            {
              name: 'position',
              type: 'select',
              required: true,
              defaultValue: 'left',
              options: [
                { label: 'Left of brand', value: 'left' },
                { label: 'Right of brand', value: 'right' },
              ],
              admin: {
                width: '30%',
                description: 'Side of the centered brand on desktop.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              label: 'Visible',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'Uncheck to hide this link temporarily without removing it.',
              },
            },
            {
              name: 'openInNewTab',
              type: 'checkbox',
              label: 'Open in new tab',
              defaultValue: false,
              admin: {
                width: '50%',
                description: 'Adds target="_blank" and rel="noopener noreferrer".',
              },
            },
          ],
        },
      ],
    },
  ],
}
