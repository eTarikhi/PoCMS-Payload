'use client'

import {
  CheckIcon,
  LoaderCircleIcon,
  MailIcon,
  SendIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import { Input } from '@/components/admin/elements/Input'

/**
 * The two things on /admin/email that talk to the server: sending a test message, and previewing a
 * template.
 *
 * Both go through the same endpoints the page describes, so what the preview shows and what a test
 * send produces are the same rendering — not a copy of it kept in the browser. The preview is fetched
 * rather than embedded because the templates are server code that reads the site settings: a preview
 * rendered anywhere else would be a picture of an email rather than the email.
 */

type Reply = { ok: boolean; error?: string; hint?: string; [key: string]: unknown }

async function post(path: string, body: unknown): Promise<Reply> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as Reply
    return response.ok ? { ...data, ok: data.ok !== false } : { ...data, ok: false }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function get(path: string): Promise<Reply> {
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' } })
    const data = (await response.json().catch(() => ({}))) as Reply
    return response.ok ? { ...data, ok: true } : { ...data, ok: false }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

type TestResult = {
  status: string
  to: string
  subject: string
  template: string
  messageId: string | null
  error: string | null
}

/**
 * Send one email, to yourself by default.
 *
 * The point is that "will a password reset arrive?" becomes a question with an answer in ten seconds
 * rather than something discovered by a person who cannot sign in. It sends through the real adapter,
 * so the development guards apply to it too, and it lands in the email log beside every other send.
 */
export function SendTestForm({
  templates,
  defaultTo,
  provider,
}: {
  templates: { slug: string; label: string }[]
  defaultTo: string
  provider: string
}) {
  const [to, setTo] = React.useState(defaultTo)
  const [template, setTemplate] = React.useState('test')
  const [busy, setBusy] = React.useState(false)
  const [reply, setReply] = React.useState<Reply | null>(null)

  const send = async () => {
    setBusy(true)
    setReply(null)
    const result = await post('/api/email/test', { to, template })
    setReply(result)
    setBusy(false)
  }

  const outcome = reply?.result as TestResult | undefined

  return (
    <div className="acn:flex acn:flex-col acn:gap-3">
      <div className="acn:flex acn:flex-col acn:gap-2 acn:sm:flex-row">
        <label className="acn:flex acn:flex-1 acn:flex-col acn:gap-1.5 acn:text-sm">
          <span className="acn:font-medium">Send to</span>
          <Input
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="you@example.com"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="acn:flex acn:flex-col acn:gap-1.5 acn:text-sm acn:sm:w-56">
          <span className="acn:font-medium">Template</span>
          <select
            className="acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1.5 acn:text-sm"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
          >
            {templates.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <div className="acn:flex acn:items-end">
          <Button
            disabled={busy || !to.includes('@')}
            onClick={() => void send()}
            className="acn:w-full acn:sm:w-auto"
          >
            {busy ? (
              <LoaderCircleIcon aria-hidden className="acn:motion-safe:animate-spin" />
            ) : (
              <SendIcon aria-hidden />
            )}
            {busy ? 'Sending…' : 'Send it'}
          </Button>
        </div>
      </div>

      <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
        Sent through <code className="acn:font-mono">{provider}</code>, exactly as a real email would
        be, and recorded in the log below. A test send is still an email to a real address, so the
        default is your own.
      </p>

      {reply && !reply.ok ? (
        <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-destructive">
          <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
          <span>
            {reply.error ?? 'The email was not sent.'}
            {reply.hint ? ` ${reply.hint}` : ''}
          </span>
        </p>
      ) : null}

      {outcome ? (
        <div
          className={
            outcome.status === 'failed'
              ? 'acn:rounded-lg acn:border acn:border-destructive/30 acn:bg-destructive/10 acn:p-3 acn:text-xs'
              : 'acn:rounded-lg acn:bg-muted acn:p-3 acn:text-xs'
          }
        >
          <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:font-medium">
            {outcome.status === 'failed' ? (
              <TriangleAlertIcon aria-hidden className="acn:size-3.5 acn:text-destructive" />
            ) : (
              <CheckIcon aria-hidden className="acn:size-3.5 acn:text-foreground" />
            )}
            {outcome.status === 'sent'
              ? `Sent to ${outcome.to}.`
              : outcome.status === 'redirected'
                ? `Redirected to ${outcome.to} — EMAIL_OVERRIDE_RECIPIENT is set, so nothing went to the address you typed.`
                : outcome.status === 'skipped'
                  ? 'Not sent: EMAIL_DISABLED is set, so the attempt was recorded and nothing left the server.'
                  : `The provider refused it: ${outcome.error ?? 'no reason given.'}`}
          </p>
          <p className="acn:m-0 acn:mt-1 acn:text-muted-foreground">
            {outcome.subject}
            {outcome.messageId ? ` · provider id ${outcome.messageId}` : ''}
          </p>
          {outcome.status === 'sent' ? (
            <p className="acn:m-0 acn:mt-1 acn:text-muted-foreground">
              Arriving in spam rather than the inbox is a domain problem, not a code one: the provider
              needs SPF and DKIM for the sending domain before it will deliver to the inbox.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type RenderedTemplate = {
  slug: string
  label: string
  description: string
  sample: Record<string, unknown>
  subject: string
  html: string
  text: string
}

/**
 * A template, rendered with its sample data, as the reader would get it.
 *
 * The HTML is shown inside a sandboxed iframe rather than injected into the page: an email document is
 * a complete HTML page with its own styles, and dropping it into the admin's markup would either be
 * rewritten by the admin's CSS or rewrite the admin's. The plain-text body is shown beside it, because
 * a template whose text version is an afterthought is a template that arrives as markup in a terminal
 * mail client.
 */
export function TemplatePreview({
  templates,
  initial,
}: {
  templates: { slug: string; label: string }[]
  initial: string
}) {
  const [slug, setSlug] = React.useState(initial)
  const [rendered, setRendered] = React.useState<RenderedTemplate | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [body, setBody] = React.useState<'html' | 'text'>('html')

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      setBusy(true)
      setError(null)
      const result = await get(`/api/email/templates?template=${encodeURIComponent(slug)}`)
      if (cancelled) return
      const list = Array.isArray(result.templates) ? (result.templates as RenderedTemplate[]) : []
      if (result.ok && list.length > 0) setRendered(list[0])
      else setError(result.error ?? 'The template could not be rendered.')
      setBusy(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div className="acn:flex acn:flex-col acn:gap-3">
      <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-2">
        <select
          aria-label="Template"
          className="acn:rounded-md acn:border acn:border-input acn:bg-transparent acn:px-2.5 acn:py-1.5 acn:text-sm"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        >
          {templates.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.label}
            </option>
          ))}
        </select>

        <div className="acn:flex acn:gap-1">
          {(['html', 'text'] as const).map((which) => (
            <Button
              key={which}
              variant={body === which ? 'secondary' : 'outline'}
              size="xs"
              onClick={() => setBody(which)}
            >
              {which === 'html' ? 'As delivered' : 'Plain text'}
            </Button>
          ))}
        </div>

        {busy ? (
          <span className="acn:flex acn:items-center acn:gap-1.5 acn:text-xs acn:text-muted-foreground">
            <LoaderCircleIcon aria-hidden className="acn:size-3.5 acn:motion-safe:animate-spin" />
            Rendering…
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="acn:m-0 acn:flex acn:items-start acn:gap-1.5 acn:text-xs acn:text-destructive">
          <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-3.5 acn:shrink-0" />
          {error}
        </p>
      ) : null}

      {rendered ? (
        <>
          <div>
            <p className="acn:m-0 acn:text-sm acn:font-medium">{rendered.subject}</p>
            <p className="acn:m-0 acn:mt-0.5 acn:text-xs acn:text-muted-foreground">
              {rendered.description}
            </p>
            <div className="acn:mt-1.5 acn:flex acn:flex-wrap acn:gap-1.5">
              <Badge variant="secondary">
                {Math.round(rendered.html.length / 1024)} kB of HTML
              </Badge>
              <Badge variant="secondary">{rendered.text.length} characters of text</Badge>
              {Object.keys(rendered.sample ?? {}).length > 0 ? (
                <Badge variant="outline">
                  sample: {Object.keys(rendered.sample).slice(0, 4).join(', ')}
                  {Object.keys(rendered.sample).length > 4 ? '…' : ''}
                </Badge>
              ) : null}
            </div>
          </div>

          {body === 'html' ? (
            <iframe
              title={`Preview of the ${rendered.label} email`}
              // Sandboxed and sourceless: an email is a whole HTML document, and it must not run
              // anything or reach the admin's own styles either way.
              sandbox=""
              srcDoc={rendered.html}
              className="acn:h-[520px] acn:w-full acn:rounded-lg acn:border acn:border-border acn:bg-white"
            />
          ) : (
            <pre className="acn:m-0 acn:max-h-[520px] acn:overflow-auto acn:rounded-lg acn:border acn:border-border acn:bg-muted acn:p-3 acn:font-mono acn:text-xs acn:whitespace-pre-wrap">
              {rendered.text}
            </pre>
          )}
        </>
      ) : null}
    </div>
  )
}

/** A short note for a card that has nothing to show yet. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-xs acn:text-muted-foreground">
      <MailIcon aria-hidden className="acn:size-3.5" />
      {children}
    </p>
  )
}
