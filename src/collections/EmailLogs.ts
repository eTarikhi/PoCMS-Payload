import type { CollectionConfig } from 'payload'

import { hasCapability } from '../access/permissions'
import { EMAIL_TEMPLATE_SLUGS } from '../email/templates'

/**
 * Every email this site attempted, sent or not.
 *
 * Payload sends through one adapter and keeps no record of it, so "did the password reset go out?"
 * has no answer until somebody checks the provider's dashboard — which is a different login, a
 * different retention window and no connection to the person who pressed the button. This collection
 * is that answer: one document per attempt, written by the adapter wrapper (`src/email/adapter.ts`)
 * around whichever provider is configured, so it holds this site's templates *and* Payload's own
 * auth emails.
 *
 * Nobody writes it through the API (`create` and `update` are false): the wrapper uses the Local API
 * with `overrideAccess`, which keeps the document a truthful account of what happened rather than
 * something an administrator can tidy up. Reading and deleting need the **Email** capability.
 *
 * What it stores, and the one thing it never stores:
 *
 *   - the recipient, the subject, the template, the provider's own id, the size, how long the
 *     provider took, who triggered it, and — when it went wrong — the provider's error;
 *   - when a development override redirected the message, the address it was really for, because
 *     "it went to the wrong person" is the failure the override exists to prevent and it should be
 *     visible in the one place it could happen;
 *   - **never the body.** A password reset email carries a live token in its HTML, so a log that kept
 *     bodies would let anybody who can read the log take over that account — a much wider audience
 *     than the token was ever meant for. There is no flag that turns this on.
 */
export const EmailLogs: CollectionConfig = {
  slug: 'email-logs',
  labels: { singular: 'Email log', plural: 'Email log' },
  // Guarded by the capability below, not by a per-role access level: like the audit log, it is tool
  // data rather than content, and a level nobody can be given would only clutter the Roles screen.
  custom: { permissions: false },
  admin: {
    group: 'Admin',
    useAsTitle: 'subject',
    defaultColumns: ['status', 'template', 'to', 'subject', 'createdAt'],
    description:
      'Every email the site attempted: who it went to, which template, whether the provider accepted it, and what it said when it did not. Bodies are never stored.',
    hidden: ({ user }) => !hasCapability(user, 'manageEmails'),
    listSearchableFields: ['to', 'subject'],
  },
  // Saved views: store and share this list view's filters, columns and sort order.
  enableQueryPresets: true,
  access: {
    read: ({ req }) => hasCapability(req.user, 'manageEmails'),
    // The adapter wrapper writes these with `overrideAccess`; nothing creates or edits one by hand.
    create: () => false,
    update: () => false,
    delete: ({ req }) => hasCapability(req.user, 'manageEmails'),
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Sent', value: 'sent' },
        {
          label: 'Redirected',
          value: 'redirected',
          // A development override sent it somewhere else; see `redirectedFrom`.
        },
        { label: 'Skipped', value: 'skipped' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: {
        position: 'sidebar',
        description: 'What the provider did with it.',
      },
    },
    {
      name: 'template',
      type: 'select',
      index: true,
      options: [
        ...EMAIL_TEMPLATE_SLUGS.map((slug) => ({
          label: slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
          value: slug,
        })),
        // Payload's own auth emails arrive without a template header of ours.
        { label: 'Payload (auth)', value: 'payload' },
      ],
      admin: { position: 'sidebar', description: 'Which of this site’s templates produced it.' },
    },
    {
      name: 'to',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The address the message was delivered to.' },
    },
    {
      name: 'redirectedFrom',
      type: 'text',
      admin: {
        description:
          'Set when EMAIL_OVERRIDE_RECIPIENT took the place of the real recipient: this is the address the message was meant for.',
      },
    },
    {
      name: 'from',
      type: 'text',
      admin: { description: 'The From address the message carried.' },
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
    },
    {
      name: 'error',
      type: 'textarea',
      admin: {
        description: 'The provider’s own words when it refused, or why nothing was sent.',
      },
    },
    {
      name: 'provider',
      type: 'text',
      admin: { description: 'The adapter that handled it (`resend-rest`, `nodemailer`, `console`).' },
    },
    {
      name: 'messageId',
      type: 'text',
      admin: { description: 'The provider’s id for the message, for finding it in their dashboard.' },
    },
    { name: 'bytes', type: 'number', admin: { description: 'Size of the HTML and text bodies.' } },
    { name: 'durationMs', type: 'number', admin: { description: 'How long the provider took.' } },
    {
      name: 'triggeredBy',
      type: 'text',
      admin: {
        description:
          'Who asked for it, when a person did: the signed-in address behind an admin action.',
      },
    },
    {
      name: 'context',
      type: 'json',
      admin: {
        description:
          'Whatever the caller wanted kept beside the send (a document id, a job run). Never a message body.',
      },
    },
  ],
}
