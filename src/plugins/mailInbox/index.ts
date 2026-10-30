import type { CollectionConfig, Plugin } from 'payload'

import { createMailAttachmentsCollection } from './collections/MailAttachments'
import { createMailLabelsCollection } from './collections/MailLabels'
import { createMailMessagesCollection } from './collections/MailMessages'
import { createMailThreadsCollection } from './collections/MailThreads'
import { createMailWebhookEventsCollection } from './collections/MailWebhookEvents'
import {
  DEFAULT_MAX_ATTACHMENT_BYTES,
  DEFAULT_WEBHOOK_RETENTION_DAYS,
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_LABELS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_THREADS_COLLECTION,
  MAIL_WEBHOOK_EVENTS_COLLECTION,
} from './constants'
import { createMailActionEndpoints } from './endpoints/mailActions'
import { createMailStreamEndpoint } from './endpoints/mailStream'
import { createResendWebhookEndpoint } from './endpoints/resendWebhook'
import { createIngestInboundWorkflow } from './jobs/ingestWorkflow'
import { createSendOutboundWorkflow } from './jobs/outboundWorkflow'
import {
  createApplyDeliveryTelemetryTask,
  createPruneWebhookLedgerTask,
} from './jobs/telemetryTask'
import { createFormSubmissionToInboxHook } from './services/formBridge'
import { ensureDefaultMailLabels } from './services/inboxQueries'
import type { MailInboxPluginOptions } from './types'

export * from './constants'
export * from './types'

/**
 * Self-contained Mail Inbox Plugin for Payload CMS v3.90.2 + Resend:
 *
 * - **Collections**: `mail-threads` (with virtual `join` to `mail-messages`), `mail-messages`,
 *   `mail-attachments` (private RBAC-gated upload collection), `mail-labels`, and `mail-webhook-events`
 *   (`svixId` unique idempotency ledger).
 * - **Endpoints**: `POST /api/webhooks/resend` (raw UTF-8 Standard Webhooks / Svix HMAC-SHA256 verifier),
 *   `GET /api/mail/inbox`, `GET /api/mail/threads/:id`, `POST /api/mail/send`, `PATCH /api/mail/threads/bulk`,
 *   `POST /api/mail/labels`, `GET /api/mail/unread-count`, and `GET /api/mail/stream` (dual-mode SSE).
 * - **Jobs & Concurrency**: Enables `jobs.enableConcurrencyControl = true`, registers checkpointed
 *   workflows (`ingestInboundEmail`, `sendOutboundEmail`) and tasks (`applyDeliveryTelemetry`,
 *   `pruneWebhookLedger`) on `queue: 'mail'`.
 * - **Form Bridge**: Automatically mirrors `form-submissions` (/contact & Request CV) into conversational
 *   `mail-threads` so operators can triage and reply directly via Resend from `/admin/inbox`.
 * - **Admin UI**: Registers `/admin/inbox` 3-pane workspace (`views.inbox`) and `mail-inbox` dashboard widget.
 */
export const mailInboxPlugin =
  (options: MailInboxPluginOptions = {}): Plugin =>
  (incomingConfig) => {
    const isEnabled = options.enabled !== false
    const alwaysInsert = options.alwaysInsertCollections !== false

    if (!isEnabled && !alwaysInsert) {
      return incomingConfig
    }

    const existingCollections = incomingConfig.collections ?? []
    const hasFormSubmissions = existingCollections.some(
      (c) => c.slug === 'form-submissions',
    )

    const applyOverride = (
      col: CollectionConfig,
      overrideFn?: (c: CollectionConfig) => CollectionConfig,
    ): CollectionConfig => (overrideFn ? overrideFn(col) : col)

    const mailCollections: CollectionConfig[] = [
      applyOverride(
        createMailThreadsCollection({ hasFormSubmissions }),
        options.threadOverrides,
      ),
      applyOverride(createMailMessagesCollection(), options.messageOverrides),
      applyOverride(
        createMailAttachmentsCollection({
          maxAttachmentBytes: options.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES,
        }),
        options.attachmentOverrides,
      ),
      applyOverride(createMailLabelsCollection(), options.labelOverrides),
      createMailWebhookEventsCollection(),
    ]

    // Avoid duplicate collection registration if the plugin were ever invoked twice
    const existingSlugs = new Set(existingCollections.map((c) => c.slug))
    const collectionsToAppend = mailCollections.filter((c) => !existingSlugs.has(c.slug))

    // Non-destructively attach `afterChange` form-to-inbox bridge onto `form-submissions` when enabled
    const bridgeEnabled = isEnabled && options.bridgeFormSubmissions !== false
    const patchedCollections = existingCollections.map((col) => {
      if (!bridgeEnabled || col.slug !== 'form-submissions') return col
      const bridgeHook = createFormSubmissionToInboxHook()
      return {
        ...col,
        hooks: {
          ...(col.hooks ?? {}),
          afterChange: [...(col.hooks?.afterChange ?? []), bridgeHook],
        },
      }
    })

    if (!isEnabled) {
      return {
        ...incomingConfig,
        collections: [...patchedCollections, ...collectionsToAppend],
      }
    }

    const resolveApiKey = () =>
      (options.apiKey ?? process.env.RESEND_API_KEY ?? '').trim()
    const resolveWebhookSecret = () =>
      (options.webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET ?? '').trim()

    const endpoints = [
      createResendWebhookEndpoint({ getWebhookSecret: resolveWebhookSecret }),
      ...createMailActionEndpoints({
        apiKey: options.apiKey,
        webhookSecret: options.webhookSecret,
        identities: options.identities,
      }),
      createMailStreamEndpoint(),
    ]

    const ingestWorkflow = createIngestInboundWorkflow({
      getApiKey: resolveApiKey,
      maxAttachmentBytes: options.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES,
    })
    const outboundWorkflow = createSendOutboundWorkflow({
      getApiKey: resolveApiKey,
    })
    const telemetryTask = createApplyDeliveryTelemetryTask()
    const pruneLedgerTask = createPruneWebhookLedgerTask(
      options.webhookRetentionDays ?? DEFAULT_WEBHOOK_RETENTION_DAYS,
    )

    const existingViews = incomingConfig.admin?.components?.views ?? {}
    const existingWidgets = incomingConfig.admin?.dashboard?.widgets ?? []
    const hasInboxWidget = existingWidgets.some((w) => w.slug === 'mail-inbox')
    const prevOnInit = incomingConfig.onInit

    return {
      ...incomingConfig,
      admin: {
        ...incomingConfig.admin,
        components: {
          ...incomingConfig.admin?.components,
          views: {
            ...existingViews,
            inbox: {
              Component: '/components/admin/views/Inbox#InboxView',
              path: '/inbox',
              meta: { title: 'Mail inbox' },
            },
          },
        },
        dashboard: incomingConfig.admin?.dashboard
          ? {
              ...incomingConfig.admin.dashboard,
              widgets: hasInboxWidget
                ? existingWidgets
                : [
                    ...existingWidgets,
                    {
                      slug: 'mail-inbox',
                      label: 'Mail inbox',
                      Component: '/components/admin/widgets/MailInbox#MailInboxWidget',
                      minWidth: 'small',
                    },
                  ],
            }
          : undefined,
      },
      collections: [...patchedCollections, ...collectionsToAppend],
      endpoints: [...(incomingConfig.endpoints ?? []), ...endpoints],
      jobs: incomingConfig.jobs
        ? {
            ...incomingConfig.jobs,
            enableConcurrencyControl: true,
            tasks: [
              ...(incomingConfig.jobs.tasks ?? []),
              telemetryTask as never,
              pruneLedgerTask as never,
            ],
            workflows: [
              ...(incomingConfig.jobs.workflows ?? []),
              ingestWorkflow as never,
              outboundWorkflow as never,
            ],
          }
        : undefined,
      onInit: async (payload) => {
        if (prevOnInit) {
          await prevOnInit(payload)
        }
        await ensureDefaultMailLabels(payload)
      },
    }
  }

export {
  MAIL_THREADS_COLLECTION,
  MAIL_MESSAGES_COLLECTION,
  MAIL_ATTACHMENTS_COLLECTION,
  MAIL_LABELS_COLLECTION,
  MAIL_WEBHOOK_EVENTS_COLLECTION,
}
