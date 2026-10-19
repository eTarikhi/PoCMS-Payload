import type { CollectionSlug, DashboardConfig, Field } from 'payload'

/**
 * Dashboard widgets (roadmap P4). Payload's modular dashboard renders each widget as a server
 * component with the request, user and permissions; editors can rearrange, resize, remove and re-add
 * widgets (stored in their preferences). All data comes from the Local API with access control on.
 */
const dir = '/components/admin/widgets'

/** Collections a "Content count" card can show (the users collection is admin-only, so not listed). */
export const STAT_COLLECTIONS = [
  { label: 'Articles', value: 'articles' },
  { label: 'Projects', value: 'projects' },
  { label: 'Media', value: 'media' },
  { label: 'Certificates', value: 'certificates' },
  { label: 'Experiences', value: 'experiences' },
  { label: 'Educations', value: 'educations' },
  { label: 'Skills', value: 'skills' },
  { label: 'Services', value: 'services' },
] as const satisfies readonly { label: string; value: CollectionSlug }[]

const statFields: Field[] = [
  {
    name: 'collection',
    type: 'select',
    required: true,
    defaultValue: 'articles',
    options: STAT_COLLECTIONS.map(({ label, value }) => ({ label, value })),
  },
]

export const dashboard: DashboardConfig = {
  widgets: [
    {
      slug: 'welcome',
      label: 'Welcome',
      Component: `${dir}/Welcome#WelcomeWidget`,
      minWidth: 'medium',
    },
    {
      slug: 'content-health',
      label: 'Needs attention',
      Component: `${dir}/ContentHealth#ContentHealthWidget`,
      minWidth: 'small',
    },
    {
      slug: 'content-count',
      label: 'Content count',
      Component: `${dir}/ContentCount#ContentCountWidget`,
      fields: statFields,
      maxWidth: 'medium',
    },
    {
      slug: 'publishing-activity',
      label: 'Publishing activity',
      Component: `${dir}/PublishingActivity#PublishingActivityWidget`,
      minWidth: 'medium',
    },
    {
      slug: 'recent-changes',
      label: 'Recent changes',
      Component: `${dir}/RecentChanges#RecentChangesWidget`,
      minWidth: 'small',
    },
  ],
  defaultLayout: [
    { widgetSlug: 'welcome', width: 'full' },
    { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'articles' } },
    { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'projects' } },
    { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'media' } },
    { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'certificates' } },
    { widgetSlug: 'publishing-activity', width: 'large' },
    { widgetSlug: 'content-health', width: 'small' },
    { widgetSlug: 'recent-changes', width: 'full' },
    // Payload's built-in collection cards stay available below the widgets.
    { widgetSlug: 'collections', width: 'full' },
  ],
}
