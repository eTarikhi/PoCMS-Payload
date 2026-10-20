import type { CollectionSlug, DashboardConfig, Field, WidgetInstance } from 'payload'

import { hasCapability } from '@/access/permissions'
import { customLabel } from '@/i18n/labels'

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
    label: customLabel('custom:widgets.fields.collection'),
    options: STAT_COLLECTIONS.map(({ label, value }) => ({ label, value })),
  },
]

const periodField: Field = {
  name: 'period',
  type: 'select',
  required: true,
  defaultValue: '7',
  label: customLabel('custom:widgets.fields.period'),
  options: [
    { label: customLabel('custom:widgets.period.last7'), value: '7' },
    { label: customLabel('custom:widgets.period.last30'), value: '30' },
    { label: customLabel('custom:widgets.period.last90'), value: '90' },
  ],
}

export const dashboard: DashboardConfig = {
  widgets: [
    {
      slug: 'welcome',
      label: customLabel('custom:widgets.welcome'),
      Component: `${dir}/Welcome#WelcomeWidget`,
      minWidth: 'medium',
    },
    {
      slug: 'content-health',
      label: customLabel('custom:widgets.contentHealth'),
      Component: `${dir}/ContentHealth#ContentHealthWidget`,
      minWidth: 'small',
    },
    {
      slug: 'content-count',
      label: customLabel('custom:widgets.contentCount'),
      Component: `${dir}/ContentCount#ContentCountWidget`,
      fields: statFields,
      maxWidth: 'medium',
    },
    {
      slug: 'publishing-activity',
      label: customLabel('custom:widgets.publishingActivity'),
      Component: `${dir}/PublishingActivity#PublishingActivityWidget`,
      minWidth: 'medium',
    },
    {
      slug: 'recent-changes',
      label: customLabel('custom:widgets.recentChanges'),
      Component: `${dir}/RecentChanges#RecentChangesWidget`,
      minWidth: 'small',
    },
    // Integrations (docs/ui-modernization/dashboard-integrations.md). Each needs a capability
    // (ADR 0011) and shows a setup hint until its environment variables are set.
    {
      slug: 'site-traffic',
      label: customLabel('custom:widgets.siteTraffic'),
      Component: `${dir}/SiteTraffic#SiteTrafficWidget`,
      fields: [periodField],
      minWidth: 'medium',
    },
    {
      slug: 'page-speed',
      label: customLabel('custom:widgets.pageSpeed'),
      Component: `${dir}/PageSpeed#PageSpeedWidget`,
      fields: [
        {
          name: 'formFactor',
          type: 'select',
          required: true,
          defaultValue: 'PHONE',
          label: customLabel('custom:widgets.fields.formFactor'),
          options: [
            { label: customLabel('custom:widgets.devices.phones'), value: 'PHONE' },
            { label: customLabel('custom:widgets.devices.desktops'), value: 'DESKTOP' },
            { label: customLabel('custom:widgets.devices.all'), value: 'ALL' },
          ],
        },
      ],
      minWidth: 'small',
    },
    {
      slug: 'deployments',
      label: customLabel('custom:widgets.deployments'),
      Component: `${dir}/Deployments#DeploymentsWidget`,
      minWidth: 'small',
    },
    {
      slug: 'ci-status',
      label: customLabel('custom:widgets.ciStatus'),
      Component: `${dir}/CIStatus#CIStatusWidget`,
      minWidth: 'small',
    },
    {
      slug: 'audit-log',
      label: customLabel('custom:widgets.auditLog'),
      Component: `${dir}/AuditLog#AuditLogWidget`,
      minWidth: 'medium',
    },
  ],
  // New users start with this layout (Payload keeps each user's changes in their preferences);
  // integration widgets only appear for roles with their capability.
  defaultLayout: ({ req }) => {
    const analytics = hasCapability(req.user, 'viewAnalytics')
    const deployments = hasCapability(req.user, 'viewDeployments')
    const audit = hasCapability(req.user, 'viewAuditLog')
    const layout: WidgetInstance[] = [
      { widgetSlug: 'welcome', width: 'full' },
      { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'articles' } },
      { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'projects' } },
      { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'media' } },
      { widgetSlug: 'content-count', width: 'x-small', data: { collection: 'certificates' } },
      ...(analytics
        ? ([
            { widgetSlug: 'site-traffic', width: 'medium', data: { period: '7' } },
            { widgetSlug: 'page-speed', width: 'medium', data: { formFactor: 'PHONE' } },
          ] as WidgetInstance[])
        : []),
      { widgetSlug: 'publishing-activity', width: 'large' },
      { widgetSlug: 'content-health', width: 'small' },
      ...(deployments
        ? ([
            { widgetSlug: 'deployments', width: 'medium' },
            { widgetSlug: 'ci-status', width: 'medium' },
          ] as WidgetInstance[])
        : []),
      { widgetSlug: 'recent-changes', width: 'full' },
      ...(audit ? ([{ widgetSlug: 'audit-log', width: 'large' }] as WidgetInstance[]) : []),
      // Payload's built-in collection cards stay available below the widgets.
      { widgetSlug: 'collections', width: 'full' },
    ]
    return layout
  },
}
