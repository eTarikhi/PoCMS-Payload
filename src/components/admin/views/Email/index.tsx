import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { MailWarningIcon, SendIcon, FileTextIcon, HistoryIcon } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/elements/Card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { relativeTime } from '@/components/admin/utilities/dates'
import { emailBrand } from '@/email/brand'
import { emailConfig } from '@/email/settings'
import { EMAIL_TEMPLATES } from '@/email/templates'
import type { EmailLog } from '@/payload-types'

import { SendTestForm, TemplatePreview } from './Actions'

/**
 * /admin/email (`manageEmails` capability): is email configured, what does it look like, and did the
 * last one arrive.
 *
 * Payload's answer to "no email configured" is a warning at startup and a log line on every attempt,
 * which is the right behaviour for a library and the wrong one for a site: the first person to notice
 * is somebody who asked for a password reset and did not get one. So this page states the situation
 * in one line at the top — which provider, which address it sends from, whether a credential is
 * present, and whether a development guard is redirecting or suppressing everything — and then makes
 * it checkable: every template rendered as it would be delivered, and a button that sends one.
 *
 * The log below is the `email-logs` collection, written by the wrapper around the provider
 * (`src/email/adapter.ts`), which is why it holds Payload's own auth emails too and not only this
 * site's templates. It never holds a message body: a reset email carries a live token, and a log
 * anybody with this capability can read must not become a way to take over an account.
 */

/** The Badge component has six variants and no "success": a sent email is the default one. */
const STATUS_TONE: Record<EmailLog['status'], 'default' | 'destructive' | 'outline' | 'secondary'> = {
  sent: 'default',
  redirected: 'outline',
  skipped: 'secondary',
  failed: 'destructive',
}

export async function EmailView({
  i18n,
  initPageResult,
  params,
  payload,
  searchParams,
  user,
  viewActions,
}: AdminViewServerProps) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin
  const language = i18n.language

  if (!req.user) {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/email`)}`)
  }
  if (!hasCapability(req.user, 'manageEmails')) notFound()

  const config = emailConfig()
  const brand = await emailBrand(payload, {
    fromAddress: config.fromAddress,
    fromName: config.fromName,
  })

  const { docs } = await payload
    .find({
      collection: 'email-logs',
      sort: '-createdAt',
      limit: 15,
      depth: 0,
      req,
      overrideAccess: false,
    })
    .catch(() => ({ docs: [] as EmailLog[] }))
  const recent = docs as EmailLog[]

  const counts = await Promise.all(
    (['sent', 'failed', 'skipped', 'redirected'] as const).map(async (status) => ({
      status,
      total:
        (
          await payload
            .count({ collection: 'email-logs', where: { status: { equals: status } }, req })
            .catch(() => null)
        )?.totalDocs ?? 0,
    })),
  )
  const failed = counts.find((entry) => entry.status === 'failed')?.total ?? 0

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      viewActions={viewActions}
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <Gutter>
        <SetStepNav nav={[{ label: 'Email' }]} />
        <div data-testid="email" className="acn:space-y-8 acn:pt-6 acn:pb-16">
          <header className="acn:space-y-2">
            <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">Email</h1>
            <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
              Which provider sends this site’s email, what the messages look like, and whether the
              last one arrived. Payload sends through one adapter, and everything goes through it —
              the templates below and Payload’s own password-reset and verification emails — so the
              log at the bottom holds all of them.
            </p>
          </header>

          <section className="acn:space-y-4">
            <Card
              className={
                config.configured && !config.disabled
                  ? undefined
                  : 'acn:border-destructive/40 acn:bg-destructive/5'
              }
            >
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:flex-wrap acn:items-center acn:gap-2 acn:text-base">
                    <SendIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Delivery
                    <Badge
                      variant={
                        config.disabled
                          ? 'secondary'
                          : config.configured
                            ? 'default'
                            : 'destructive'
                      }
                    >
                      {config.disabled
                        ? 'Sending is off'
                        : config.configured
                          ? `${config.provider} configured`
                          : 'Not configured'}
                    </Badge>
                    {config.overrideRecipient ? <Badge variant="outline">Redirected</Badge> : null}
                  </h2>
                </CardTitle>
                <CardDescription>
                  {config.disabled
                    ? 'EMAIL_DISABLED is set, so nothing is sent. Every attempt is still recorded in the log below as skipped.'
                    : config.reason
                      ? config.reason
                      : `Sending through ${config.provider}.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="acn:m-0 acn:grid acn:gap-x-6 acn:gap-y-2 acn:text-sm acn:sm:grid-cols-2">
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">Provider</dt>
                    <dd className="acn:m-0 acn:font-mono acn:text-xs">{config.provider}</dd>
                  </div>
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">From</dt>
                    <dd className="acn:m-0 acn:font-mono acn:text-xs">
                      {brand.fromName} &lt;{brand.fromAddress || 'not set'}&gt;
                    </dd>
                  </div>
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">Reply-to</dt>
                    <dd className="acn:m-0 acn:font-mono acn:text-xs">
                      {brand.supportEmail ?? 'not set'}
                    </dd>
                  </div>
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">Site name</dt>
                    <dd className="acn:m-0 acn:text-xs">{brand.siteName}</dd>
                  </div>
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">Links point at</dt>
                    <dd className="acn:m-0 acn:font-mono acn:text-xs">
                      {brand.siteUrl || 'no public address set'}
                    </dd>
                  </div>
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">Credential</dt>
                    <dd className="acn:m-0 acn:text-xs">
                      {config.provider === 'resend'
                        ? config.hasResendKey
                          ? 'RESEND_API_KEY is set'
                          : 'RESEND_API_KEY is missing'
                        : config.provider === 'nodemailer'
                          ? `${config.smtp?.host ?? 'no host'}:${config.smtp?.port ?? 0}${
                              config.smtp?.user ? ` as ${config.smtp.user}` : ''
                            }${config.hasSmtpPassword ? '' : ' (no SMTP_PASS)'}`
                          : 'none needed — messages are logged, not sent'}
                    </dd>
                  </div>
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">Redirect</dt>
                    <dd className="acn:m-0 acn:font-mono acn:text-xs">
                      {config.overrideRecipient ?? 'off'}
                    </dd>
                  </div>
                  <div className="acn:flex acn:justify-between acn:gap-3">
                    <dt className="acn:text-muted-foreground">Environment</dt>
                    <dd className="acn:m-0 acn:font-mono acn:text-xs">{config.environment}</dd>
                  </div>
                </dl>

                {!brand.siteUrl ? (
                  <p className="acn:m-0 acn:mt-3 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-destructive">
                    <MailWarningIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
                    No public address is set (<code className="acn:font-mono">NEXT_PUBLIC_SITE_URL</code>),
                    so the links in these emails have nothing to point at. A password reset that
                    arrives without a usable link is a lockout.
                  </p>
                ) : null}

                <p className="acn:m-0 acn:mt-3 acn:text-xs acn:text-muted-foreground">
                  The name, the reply-to address and the public address are read from{' '}
                  <strong>Site settings</strong> and the environment at send time, so a rename does
                  not need a deploy. The provider is chosen when the config is built: Resend when{' '}
                  <code className="acn:font-mono">RESEND_API_KEY</code> is set, SMTP when{' '}
                  <code className="acn:font-mono">SMTP_HOST</code> is, otherwise a log-only adapter —
                  and <code className="acn:font-mono">EMAIL_PROVIDER</code> overrides the choice.
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                    <SendIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Send a test
                  </h2>
                </CardTitle>
                <CardDescription>
                  One real send, through the provider above, recorded in the log like any other. The
                  answer to “will a password reset arrive?” in ten seconds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SendTestForm
                  templates={EMAIL_TEMPLATES.map((template) => ({
                    slug: template.slug,
                    label: template.label,
                  }))}
                  defaultTo={req.user?.email ?? ''}
                  provider={config.provider}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                    <FileTextIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Templates
                  </h2>
                </CardTitle>
                <CardDescription>
                  Rendered with sample data, exactly as a send renders them. Password reset and address
                  verification replace Payload’s own auth emails through{' '}
                  <code className="acn:font-mono">auth.forgotPassword.generateEmailHTML</code>; the
                  rest are this site’s.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplatePreview
                  templates={EMAIL_TEMPLATES.map((template) => ({
                    slug: template.slug,
                    label: template.label,
                  }))}
                  initial="forgot-password"
                />
              </CardContent>
            </Card>
          </section>

          <section className="acn:space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:flex-wrap acn:items-center acn:gap-2 acn:text-base">
                    <HistoryIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Recent sends
                    {failed > 0 ? <Badge variant="destructive">{failed} failed</Badge> : null}
                  </h2>
                </CardTitle>
                <CardDescription>
                  Every attempt, including Payload’s own auth emails. The full log is the{' '}
                  <strong>Email log</strong> collection in the sidebar. Bodies are never stored: a
                  password-reset email carries a live token, and a log is not a place to keep one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
                    Nothing has been sent yet. A test send above is the quickest way to see whether it
                    works — and if no provider is configured, the attempt still lands here as skipped.
                  </p>
                ) : (
                  <div className="acn:overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Template</TableHead>
                          <TableHead>To</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead className="acn:text-right">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recent.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <Badge variant={STATUS_TONE[entry.status] ?? 'secondary'}>
                                {entry.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="acn:font-mono acn:text-xs">
                              {entry.template ?? '–'}
                            </TableCell>
                            <TableCell className="acn:max-w-[16rem] acn:truncate acn:text-xs">
                              {entry.to}
                              {entry.redirectedFrom ? (
                                <span
                                  className="acn:block acn:text-muted-foreground"
                                  title="EMAIL_OVERRIDE_RECIPIENT took the place of this address"
                                >
                                  meant for {entry.redirectedFrom}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="acn:max-w-[22rem]">
                              <span className="acn:line-clamp-2 acn:text-xs">{entry.subject}</span>
                              {entry.error ? (
                                <span className="acn:line-clamp-2 acn:block acn:text-xs acn:text-destructive">
                                  {entry.error}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="acn:font-mono acn:text-xs acn:text-muted-foreground">
                              {entry.provider ?? '–'}
                              {entry.durationMs ? ` · ${Math.round(entry.durationMs)} ms` : ''}
                            </TableCell>
                            <TableCell className="acn:text-right acn:text-xs acn:text-muted-foreground">
                              {relativeTime(entry.createdAt, language)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

export default EmailView
