import type { CollectionConfig } from 'payload'

import { hasCapability } from '../access/permissions'

/**
 * Stored Lighthouse runs (E4b): one document per PageSpeed Insights run, written by the
 * `pagespeed-report` job for phones and desktops. The Page speed widget reads the newest report per
 * device and draws the performance trend from the history, so the dashboard needs no Google call.
 *
 * Written only by the job (Local API, `overrideAccess`); read with the Site traffic and page speed
 * capability. Pruned to 90 days by the job.
 */
export const PageSpeedReports: CollectionConfig = {
  slug: 'pagespeed-reports',
  labels: { singular: 'Page speed report', plural: 'Page speed reports' },
  admin: {
    group: 'Admin',
    hidden: true,
    useAsTitle: 'url',
    defaultColumns: ['url', 'strategy', 'fetchedAt', 'createdAt'],
  },
  access: {
    read: ({ req }) => hasCapability(req.user, 'viewAnalytics'),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'url', type: 'text', required: true, index: true },
    {
      name: 'strategy',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Phones', value: 'mobile' },
        { label: 'Desktops', value: 'desktop' },
      ],
    },
    { name: 'fetchedAt', type: 'date', required: true, index: true },
    { name: 'lighthouseVersion', type: 'text' },
    {
      name: 'scores',
      type: 'array',
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'label', type: 'text', required: true },
        { name: 'score', type: 'number' },
        {
          name: 'rating',
          type: 'select',
          options: [
            { label: 'Good', value: 'good' },
            { label: 'Needs improvement', value: 'average' },
            { label: 'Poor', value: 'poor' },
          ],
        },
      ],
    },
    {
      name: 'metrics',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'label', type: 'text', required: true },
        { name: 'display', type: 'text' },
        { name: 'value', type: 'number' },
        {
          name: 'rating',
          type: 'select',
          options: [
            { label: 'Good', value: 'good' },
            { label: 'Needs improvement', value: 'average' },
            { label: 'Poor', value: 'poor' },
          ],
        },
      ],
    },
  ],
}
