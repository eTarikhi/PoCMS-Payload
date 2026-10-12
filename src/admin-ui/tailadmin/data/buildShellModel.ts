import { pickEntityIcon } from '../icons'
import type {
  AdminNavGroup,
  Branding,
  ContentStats,
  SearchIndexEntry,
  SidebarItem,
  SidebarSection,
  SidebarUser,
} from './types'

/**
 * Turns Payload navigation data + dashboard stats into the props the TailAdmin
 * shell expects. Pure and synchronous, so it is trivially unit-testable.
 */

export type ShellUser = {
  email?: string | null
  name?: string | null
  collection?: string
  avatarUrl?: string | null
}

export type ShellModel = {
  sections: SidebarSection[]
  footer: SidebarItem[]
  searchIndex: SearchIndexEntry[]
  branding: Branding
  user: SidebarUser
}

export type BuildShellModelArgs = {
  navGroups: AdminNavGroup[]
  stats?: Pick<ContentStats, 'totals'> | null
  branding?: Partial<Branding>
  user?: ShellUser | null
  /** Admin base path, in case `config.routes.admin` was changed. */
  adminBase?: string
  /** Where the TailAdmin dashboard lives, relative to the admin base. */
  basePath?: string
}

const DEFAULT_BRANDING: Branding = {
  name: 'PoCMS',
  shortName: 'PO',
  tagline: 'TailAdmin pilot',
}

export function buildShellModel(args: BuildShellModelArgs): ShellModel {
  const {
    navGroups,
    branding,
    user,
    adminBase = '/admin',
    basePath = '/tailadmin',
  } = args

  const dashboardHref = `${adminBase}${basePath}`
  const uiKitHref = `${dashboardHref}/ui-kit`

  const resolvedBranding: Branding = { ...DEFAULT_BRANDING, ...branding }

  const overviewSection: SidebarSection = {
    label: 'Menu',
    items: [
      { label: 'Dashboard', href: dashboardHref, icon: 'grid' },
      { label: 'UI kit', href: uiKitHref, icon: 'palette' },
      { label: 'Payload admin', href: adminBase, icon: 'settings' },
    ],
  }

  const contentSections: SidebarSection[] = navGroups.map((group) => ({
    label: group.label === 'Menu' ? 'Content' : group.label,
    items: group.entities.map((entity) => ({
      label: entity.label,
      href: entity.href,
      icon: pickEntityIcon(entity.slug, entity.type),
    })),
  }))

  const resourcesSection: SidebarSection = {
    label: 'Resources',
    items: [
      {
        label: 'Payload docs',
        href: 'https://payloadcms.com/docs',
        icon: 'docs',
        external: true,
      },
      {
        label: 'TailAdmin demo',
        href: 'https://nextjs-demo.tailadmin.com',
        icon: 'externalLink',
        external: true,
      },
    ],
  }

  const sections = [overviewSection, ...contentSections, resourcesSection]

  const searchIndex: SearchIndexEntry[] = [
    { label: 'TailAdmin dashboard', href: dashboardHref, group: 'Pilot' },
    { label: 'TailAdmin UI kit', href: uiKitHref, group: 'Pilot' },
    { label: 'Payload dashboard', href: adminBase, group: 'Pilot' },
    ...navGroups.flatMap((group) =>
      group.entities.map((entity) => ({
        label: entity.label,
        href: entity.href,
        group: group.label === 'Menu' ? 'Content' : group.label,
      })),
    ),
  ]

  const footer: SidebarItem[] = [
    { label: 'My account', href: `${adminBase}/account`, icon: 'userCircle' },
    { label: 'Sign out', href: `${adminBase}/logout`, icon: 'logOut' },
  ]

  const resolvedUser: SidebarUser = {
    name: user?.name ?? null,
    email: user?.email ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    accountHref: `${adminBase}/account`,
    logoutHref: `${adminBase}/logout`,
  }

  return {
    sections,
    footer,
    searchIndex,
    branding: resolvedBranding,
    user: resolvedUser,
  }
}

/** Default icon for a collection when nothing better is known. */
export { pickEntityIcon }
