import type { Endpoint, PayloadRequest } from 'payload'

import { hasCapability } from '@/access/permissions'
import { emailBrand, siteOrigin } from '@/email/brand'
import { emailConfig } from '@/email/settings'
import { previewTemplate, sendTemplate } from '@/email/send'
import { EMAIL_TEMPLATES, templateBySlug } from '@/email/templates'

/**
 * The email endpoints behind `/admin/email`.
 *
 *   GET  /api/email/status      Is a provider configured, what does it send as, and what happened
 *                               recently — the answer to "will password resets arrive?".
 *   GET  /api/email/templates   Every template, rendered with its sample data, as subject + HTML +
 *                               text. A preview, so a change to a template is seen before it is sent.
 *   POST /api/email/test        Send one. Defaults to the test template and the signed-in address,
 *                               because the useful case is "does this reach *me*".
 *
 * All three need the **Email** capability. The test send is the only one that leaves the building: it
 * goes through the same adapter as everything else, so the two development guards apply to it too —
 * `EMAIL_OVERRIDE_RECIPIENT` redirects it and `EMAIL_DISABLED` records it as skipped — and it is
 * written to the email log like any other send, with the address of whoever pressed the button
 * beside it.
 */

const denied = () =>
  Response.json({ error: 'Needs the Email permission.' }, { status: 403 })

const allowed = (req: PayloadRequest): boolean => hasCapability(req.user, 'manageEmails')

/** What the configuration amounts to, without any credential in it. */
const describeConfig = () => {
  const config = emailConfig()
  return {
    provider: config.provider,
    fromAddress: config.fromAddress,
    fromName: config.fromName,
    configured: config.configured,
    reason: config.reason,
    disabled: config.disabled,
    overrideRecipient: config.overrideRecipient,
    supportAddress: config.supportAddress,
    smtp: config.smtp
      ? { host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, user: config.smtp.user }
      : null,
    hasResendKey: config.hasResendKey,
    hasSmtpPassword: config.hasSmtpPassword,
    environment: config.environment,
    siteUrl: siteOrigin(),
  }
}

export const emailStatusEndpoint: Endpoint = {
  path: '/email/status',
  method: 'get',
  handler: async (req) => {
    if (!allowed(req)) return denied()

    const brand = await emailBrand(req.payload, {
      fromAddress: emailConfig().fromAddress,
      fromName: emailConfig().fromName,
    })

    const [recent, byStatus] = await Promise.all([
      req.payload
        .find({ collection: 'email-logs', sort: '-createdAt', limit: 10, depth: 0, req })
        .catch(() => null),
      req.payload
        .count({ collection: 'email-logs', req })
        .catch(() => null),
    ])

    // One count per status, so the page can say "3 failed" without paging through the log.
    const statuses = ['sent', 'redirected', 'skipped', 'failed'] as const
    const counts: Record<string, number> = { total: byStatus?.totalDocs ?? 0 }
    for (const status of statuses) {
      counts[status] =
        (
          await req.payload
            .count({ collection: 'email-logs', where: { status: { equals: status } }, req })
            .catch(() => null)
        )?.totalDocs ?? 0
    }

    return Response.json({
      ok: true,
      config: describeConfig(),
      brand: {
        siteName: brand.siteName,
        siteUrl: brand.siteUrl,
        supportEmail: brand.supportEmail,
        fromAddress: brand.fromAddress,
        fromName: brand.fromName,
      },
      templates: EMAIL_TEMPLATES.map((template) => ({
        slug: template.slug,
        label: template.label,
        description: template.description,
      })),
      recent: (recent?.docs ?? []).map((doc) => ({
        id: doc.id,
        status: doc.status,
        template: doc.template,
        to: doc.to,
        redirectedFrom: doc.redirectedFrom ?? null,
        subject: doc.subject,
        provider: doc.provider ?? null,
        messageId: doc.messageId ?? null,
        error: doc.error ?? null,
        bytes: doc.bytes ?? null,
        durationMs: doc.durationMs ?? null,
        triggeredBy: doc.triggeredBy ?? null,
        createdAt: doc.createdAt,
      })),
      counts,
    })
  },
}

export const emailTemplatesEndpoint: Endpoint = {
  path: '/email/templates',
  method: 'get',
  handler: async (req) => {
    if (!allowed(req)) return denied()

    const only = req.searchParams.get('template')
    const wanted = only ? EMAIL_TEMPLATES.filter((template) => template.slug === only) : EMAIL_TEMPLATES
    if (only && wanted.length === 0) {
      return Response.json(
        {
          error: `There is no template called “${only.slice(0, 40)}”.`,
          hint: `The templates are: ${EMAIL_TEMPLATES.map((template) => template.slug).join(', ')}.`,
        },
        { status: 400 },
      )
    }

    // Rendered here, not in the browser: the templates are server code, and the preview has to be
    // what a send would produce rather than a copy of it.
    const rendered = await Promise.all(
      wanted.map(async (template) => ({
        slug: template.slug,
        label: template.label,
        description: template.description,
        sample: template.sample,
        ...(await previewTemplate(req.payload, template.slug, {
          ...template.sample,
          ...(template.slug === 'test' ? { to: req.user?.email ?? '', requestedBy: req.user?.email ?? '' } : {}),
        })),
      })),
    )

    return Response.json({ ok: true, templates: rendered })
  },
}

export const emailTestEndpoint: Endpoint = {
  path: '/email/test',
  method: 'post',
  handler: async (req) => {
    if (!allowed(req)) return denied()

    let data: Record<string, unknown> = {}
    try {
      const parsed = await req.json?.()
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
    } catch {
      data = {}
    }

    const slug = typeof data.template === 'string' && data.template.trim() ? data.template.trim() : 'test'
    const template = templateBySlug(slug)
    if (!template) {
      return Response.json(
        {
          error: `There is no template called “${slug.slice(0, 40)}”.`,
          hint: `The templates are: ${EMAIL_TEMPLATES.map((entry) => entry.slug).join(', ')}.`,
        },
        { status: 400 },
      )
    }

    // Defaults to the person pressing the button: the useful test is "does this reach me", and an
    // empty form should not become an email to nobody.
    const to =
      typeof data.to === 'string' && data.to.trim()
        ? data.to.trim()
        : (req.user?.email ?? '')
    if (!to) {
      return Response.json(
        { error: 'There is no address to send to.', hint: 'Give one, or sign in with an account that has one.' },
        { status: 400 },
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return Response.json({ error: `“${to.slice(0, 60)}” is not an email address.` }, { status: 400 })
    }

    const config = emailConfig()
    const result = await sendTemplate(req.payload, {
      template: slug,
      to,
      req,
      data: {
        ...template.sample,
        ...(typeof data.data === 'object' && data.data !== null ? (data.data as Record<string, unknown>) : {}),
        to,
        requestedBy: req.user?.email ?? '',
        adapter: config.provider,
      },
      context: { reason: 'admin-test-send', template: slug },
    })

    req.payload.logger.info({
      msg: `A test email was sent from the admin panel`,
      user: req.user?.email,
      template: slug,
      status: result.status,
      // The recipient, never the body: a test send is still an email to a real address.
      to,
    })

    return Response.json(
      {
        ok: result.ok,
        result: {
          status: result.status,
          to: result.to,
          subject: result.subject,
          template: result.template,
          messageId: result.messageId,
          error: result.error,
        },
        ...(result.status === 'skipped' && config.reason ? { hint: config.reason } : {}),
      },
      { status: result.ok || result.status === 'skipped' ? 200 : 502 },
    )
  },
}
