import type { CollectionConfig } from 'payload'

import { hasCapability } from '../access/permissions'
import { TASKS } from '../jobs/registry'

/**
 * Maintenance job runs (E4). One document per attempt, written by the runner in `src/jobs`: queued
 * when the cron call or "Run now" adds it, then running, done or failed. The admin page at
 * `/admin/jobs` reads this collection and the task registry; the collection itself is hidden from
 * the sidebar (the page is the interface).
 *
 * Nobody writes through the API: the runner uses the Local API with `overrideAccess`, so the
 * document is always a truthful record of what ran.
 */
export const Jobs: CollectionConfig = {
  // Not `jobs`: Payload resolves /api/jobs/:id as this collection before the custom endpoints,
  // which would answer 403 for /api/jobs/cron. The endpoints and the page keep the name.
  slug: 'job-runs',
  labels: { singular: 'Job run', plural: 'Job runs' },
  admin: {
    group: 'Admin',
    hidden: true,
    useAsTitle: 'task',
    defaultColumns: ['task', 'status', 'trigger', 'createdAt', 'durationMs'],
  },
  // Saved views: store and share this list view's filters, columns and sort order.
  enableQueryPresets: true,
  access: {
    read: ({ req }) => hasCapability(req.user, 'manageJobs'),
    create: () => false,
    update: () => false,
    delete: ({ req }) => hasCapability(req.user, 'manageJobs'),
  },
  fields: [
    {
      name: 'task',
      type: 'select',
      required: true,
      index: true,
      options: TASKS.map((task) => ({ label: task.label, value: task.slug })),
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'queued',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Running', value: 'running' },
        { label: 'Done', value: 'done' },
        { label: 'Failed', value: 'failed' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      name: 'trigger',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Scheduled', value: 'cron' },
      ],
    },
    {
      name: 'startedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { description: 'Who ran it, for manual runs.' },
    },
    { name: 'startedAt', type: 'date' },
    { name: 'finishedAt', type: 'date' },
    {
      name: 'durationMs',
      type: 'number',
      admin: { description: 'How long the task ran, in milliseconds.' },
    },
    {
      name: 'summary',
      type: 'textarea',
      admin: { description: 'One sentence: what the run did, or found.' },
    },
    { name: 'error', type: 'textarea' },
    {
      name: 'log',
      type: 'textarea',
      admin: { description: 'The last lines the run wrote (up to 20 kB).' },
    },
    {
      name: 'details',
      type: 'json',
      admin: { description: 'Task-specific numbers (counts, broken links) for the run detail.' },
    },
  ],
}
