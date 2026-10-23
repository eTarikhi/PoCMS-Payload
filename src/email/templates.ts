import type { EmailBrand } from './brand'
import { tokenUrl } from './brand'
import { escapeHtml, factTable, renderEmailLayout } from './layout'

/**
 * The emails this site sends.
 *
 * Each one is a pure function of its data and the brand: no database, no request, no clock — so a
 * template can be rendered in a test, in the admin panel's preview, and in a send, and all three
 * agree. Every template returns the three parts an email needs: a subject, the HTML, and a plain-text
 * body. The text version is written by hand rather than stripped from the HTML, because a reset link
 * buried in markup is a reset link nobody can click in a terminal mail client.
 *
 * What is here, and why:
 *
 *   - **forgotPassword** and **verifyEmail** replace Payload's own auth emails. Payload generates
 *     both from `auth.forgotPassword.generateEmailHTML` and `auth.verify.generateEmailHTML`, so the
 *     override is a config option, not a monkey-patch — see `src/email/auth.ts`.
 *   - **welcome** is the one this site actually needs and Payload does not have: an administrator
 *     creates an account, and the person gets a link to choose their own password. Nobody ever
 *     emails a password.
 *   - **testEmail** is what the admin panel's *Send a test* button sends. An email system whose
 *     delivery cannot be checked from the admin panel is an email system whose first failure is
 *     discovered by a user who cannot log in.
 *   - **digest** is the shape a scheduled report takes (what the nightly jobs did), so the jobs queue
 *     has somewhere to put a summary that reaches a person.
 */

export type EmailData = Record<string, unknown>

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

export type EmailTemplate = {
  slug: string
  label: string
  /** One line for the admin panel: what this email is for. */
  description: string
  /** The fields its preview form asks for, with sample values. */
  sample: EmailData
  render: (brand: EmailBrand, data: EmailData) => RenderedEmail
}

const str = (data: EmailData, key: string, fallback = ''): string => {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** The first name of a person, or "there": an email that says "Hello ," is worse than a generic one. */
const firstName = (name: string, email: string): string => {
  const first = name.trim().split(/\s+/)[0]
  if (first && first.length > 0) return first
  const local = email.split('@')[0]
  return local && local.length > 0 ? local : 'there'
}

/** The admin path Payload's own auth pages live at. */
export const ADMIN_RESET_PATH = '/admin/account/recover'
export const ADMIN_VERIFY_PATH = '/admin/account/verify'

export const forgotPasswordTemplate: EmailTemplate = {
  slug: 'forgot-password',
  label: 'Password reset',
  description:
    'Sent when somebody asks to reset their password. Payload generates it through auth.forgotPassword.generateEmailHTML; the link carries the token.',
  sample: {
    email: 'editor@example.com',
    name: 'Ada Lovelace',
    token: 'a-token-from-payload',
    expiresIn: '1 hour',
  },
  render: (brand, data) => {
    const email = str(data, 'email')
    const name = str(data, 'name')
    const token = str(data, 'token')
    const expiresIn = str(data, 'expiresIn', '1 hour')
    const url = tokenUrl(brand, ADMIN_RESET_PATH, token)

    return {
      subject: `Reset your ${brand.siteName} password`,
      html: renderEmailLayout(brand, {
        template: 'forgot-password',
        preheader: `A link to choose a new password, valid for ${expiresIn}.`,
        heading: `Reset your password, ${firstName(name, email)}`,
        sections: [
          {
            paragraphs: [
              `Somebody asked to reset the password for ${email} on ${brand.siteName}. If that was you, choose a new one with the button below.`,
              `The link works once and expires in ${expiresIn}. Asking again replaces it.`,
            ],
          },
          {
            html: token
              ? ''
              : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">If that was not you, nothing needs doing — the password stays as it is, and it is worth telling whoever runs this site that somebody tried.</p>`,
          },
        ],
        callToAction: { label: 'Choose a new password', url },
        footer: [
          `If the button does not work, open this address in your browser:`,
          url,
          token ? 'If you did not ask for this, you can ignore the email: nothing has changed.' : '',
        ].filter((line) => line.length > 0),
      }),
      text: [
        `Reset your ${brand.siteName} password`,
        '',
        `Somebody asked to reset the password for ${email}.`,
        `Choose a new one here (valid ${expiresIn}, works once):`,
        url,
        '',
        'If you did not ask for this, ignore the email — nothing has changed.',
      ].join('\n'),
    }
  },
}

export const verifyEmailTemplate: EmailTemplate = {
  slug: 'verify-email',
  label: 'Verify your address',
  description:
    'Sent when a collection has auth.verify turned on. Payload generates it through auth.verify.generateEmailHTML.',
  sample: { email: 'editor@example.com', name: 'Ada Lovelace', token: 'a-token-from-payload' },
  render: (brand, data) => {
    const email = str(data, 'email')
    const name = str(data, 'name')
    const token = str(data, 'token')
    const url = tokenUrl(brand, ADMIN_VERIFY_PATH, token)

    return {
      subject: `Confirm your ${brand.siteName} email address`,
      html: renderEmailLayout(brand, {
        template: 'verify-email',
        preheader: 'One click, and your account is ready to sign in with.',
        heading: `Confirm your email address, ${firstName(name, email)}`,
        sections: [
          {
            paragraphs: [
              `Your account on ${brand.siteName} is ready, and the last step is confirming that this address — ${email} — is yours.`,
            ],
          },
        ],
        callToAction: { label: 'Confirm your email', url },
        footer: ['If the button does not work, open this address in your browser:', url],
      }),
      text: [
        `Confirm your ${brand.siteName} email address`,
        '',
        `Your account for ${email} is ready. Confirm the address here:`,
        url,
      ].join('\n'),
    }
  },
}

export const welcomeTemplate: EmailTemplate = {
  slug: 'welcome',
  label: 'Account created',
  description:
    'Sent when an administrator creates somebody’s account. It carries a password-reset link, so the person chooses their own password and nobody ever emails one.',
  sample: {
    email: 'new-editor@example.com',
    name: 'Grace Hopper',
    token: 'a-token-from-payload',
    invitedBy: 'Ada Lovelace',
    roles: 'Editor',
  },
  render: (brand, data) => {
    const email = str(data, 'email')
    const name = str(data, 'name')
    const token = str(data, 'token')
    const invitedBy = str(data, 'invitedBy')
    const roles = str(data, 'roles')
    // No token means an administrator set a password when creating the account, so the email points
    // at the sign-in page instead of offering to choose one — and never says a link is coming.
    const url = token ? tokenUrl(brand, ADMIN_RESET_PATH, token) : tokenUrl(brand, '/admin/login')
    const adminUrl = brand.siteUrl ? tokenUrl(brand, '/admin') : ''

    return {
      subject: `You have an account on ${brand.siteName}`,
      html: renderEmailLayout(brand, {
        template: 'welcome',
        preheader: 'Choose a password, then sign in to the admin panel.',
        heading: `You have an account on ${brand.siteName}, ${firstName(name, email)}`,
        sections: [
          {
            paragraphs: [
              invitedBy
                ? `${invitedBy} created an account for you on ${brand.siteName} with the address ${email}.`
                : `An account was created for you on ${brand.siteName} with the address ${email}.`,
              token
                ? 'Choose a password with the button below, then sign in to the admin panel. Nobody — not even an administrator — can see or send you a password: this link is how you set your own.'
                : 'Sign in with the password you were given, then change it to something only you know under Account in the admin panel.',
            ],
          },
          {
            html: factTable([
              { label: 'Signed in as', value: email },
              ...(roles ? [{ label: 'Role', value: roles }] : []),
              ...(adminUrl ? [{ label: 'Admin panel', value: adminUrl }] : []),
            ]),
          },
        ],
        callToAction: { label: token ? 'Choose your password' : 'Open the sign-in page', url },
        footer: token
          ? [
              'The link works once. If it has expired, use “Forgot password” on the sign-in page.',
              'If you were not expecting this account, tell whoever runs this site and ignore the email.',
            ]
          : [
              'If you were not expecting this account, tell whoever runs this site and ignore the email.',
            ],
      }),
      text: [
        `You have an account on ${brand.siteName}`,
        '',
        invitedBy ? `${invitedBy} created an account for you.` : 'An account was created for you.',
        `Signed in as: ${email}`,
        roles ? `Role: ${roles}` : '',
        '',
        token ? 'Choose your password here (the link works once):' : 'Sign in here:',
        url,
        '',
        adminUrl ? `Then sign in at ${adminUrl}.` : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    }
  },
}

export const testEmailTemplate: EmailTemplate = {
  slug: 'test',
  label: 'Test email',
  description:
    'What the admin panel’s “Send a test” button sends: the configured provider, the From address and the site settings, so delivery can be checked before a real email depends on it.',
  sample: { to: 'you@example.com', requestedBy: 'Ada Lovelace', adapter: 'resend-rest' },
  render: (brand, data) => {
    const to = str(data, 'to')
    const requestedBy = str(data, 'requestedBy')
    const adapter = str(data, 'adapter', 'not configured')
    const redirectedFrom = str(data, 'redirectedFrom')

    return {
      subject: `Test email from ${brand.siteName}`,
      html: renderEmailLayout(brand, {
        template: 'test',
        preheader: 'If you can read this, sending works.',
        heading: 'If you can read this, sending works',
        sections: [
          {
            paragraphs: [
              requestedBy
                ? `${requestedBy} sent this from the admin panel to check that email is configured.`
                : 'This was sent from the admin panel to check that email is configured.',
              'Nothing else happened: no content changed, and no real recipient was contacted.',
            ],
          },
          {
            html: factTable([
              { label: 'Sent to', value: to || '—' },
              ...(redirectedFrom ? [{ label: 'Redirected from', value: redirectedFrom }] : []),
              { label: 'Provider', value: adapter },
              { label: 'From', value: brand.fromAddress || '—' },
              { label: 'Site', value: brand.siteName },
              { label: 'Public address', value: brand.siteUrl || 'not set' },
              { label: 'Reply to', value: brand.supportEmail ?? 'not set' },
            ]),
          },
        ],
        footer: [
          'An email that arrives but looks wrong is usually the From domain: the provider needs the domain verified (SPF and DKIM) before it will deliver to the inbox rather than spam.',
        ],
      }),
      text: [
        `Test email from ${brand.siteName}`,
        '',
        to ? `Sent to: ${to}` : '',
        `Provider: ${adapter}`,
        `From: ${brand.fromAddress || '—'}`,
        `Site: ${brand.siteName} (${brand.siteUrl || 'no public address set'})`,
        '',
        'If you can read this, sending works.',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    }
  },
}

export const digestTemplate: EmailTemplate = {
  slug: 'digest',
  label: 'Maintenance digest',
  description:
    'What the nightly jobs did, for whoever looks after the site. A list of runs, each with its verdict.',
  sample: {
    to: 'ops@example.com',
    runs: [
      { task: 'Database backup', status: 'done', summary: 'Wrote pocms-app-2026-10-23_03-00-00.sql (2.1 MB)' },
      { task: 'Database upkeep', status: 'done', summary: 'Nothing to do: 44 tables have statistics' },
      { task: 'Broken links', status: 'failed', summary: 'PageSpeed Insights refused the request' },
    ],
  },
  render: (brand, data) => {
    const runs = Array.isArray(data.runs)
      ? (data.runs as { task?: string; status?: string; summary?: string }[])
      : []
    const failed = runs.filter((run) => run.status !== 'done')
    const period = str(data, 'period', 'the last day')

    return {
      subject:
        failed.length > 0
          ? `${brand.siteName}: ${failed.length} maintenance run(s) need a look`
          : `${brand.siteName}: maintenance ran clean`,
      html: renderEmailLayout(brand, {
        template: 'digest',
        preheader: `${runs.length} scheduled run(s) over ${period}.`,
        heading: failed.length > 0 ? 'Something in the nightly runs needs a look' : 'The nightly runs came back clean',
        sections: [
          {
            paragraphs: [
              `${runs.length} scheduled task(s) ran over ${period}. ${failed.length === 0 ? 'Every one finished as it should.' : `${failed.length} did not.`}`,
            ],
          },
          {
            html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              ${runs
                .slice(0, 20)
                .map((run) => {
                  const bad = run.status !== 'done'
                  return `<tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;background:${bad ? '#fef2f2' : '#f9fafb'};">
                      <p style="margin:0;font-size:13px;color:#111827;font-weight:600;">${escapeHtml(run.task ?? 'A task')}</p>
                      <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(run.summary ?? '')}</p>
                    </td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${bad ? '#b91c1c' : '#15803d'};white-space:nowrap;vertical-align:top;">
                      ${escapeHtml(run.status ?? 'unknown')}
                    </td>
                  </tr>`
                })
                .join('')}
            </table>`,
          },
        ],
        callToAction: brand.siteUrl
          ? { label: 'Open the jobs page', url: tokenUrl(brand, '/admin/jobs') }
          : undefined,
        footer: [
          'Scheduled runs happen once a day through Vercel Cron; each one is a document in the job queue with its own log.',
        ],
      }),
      text: [
        `${brand.siteName}: maintenance over ${period}`,
        '',
        ...runs.slice(0, 20).map((run) => `${run.task ?? 'A task'} — ${run.status ?? 'unknown'}: ${run.summary ?? ''}`),
        '',
        brand.siteUrl ? `The job queue: ${tokenUrl(brand, '/admin/jobs')}` : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    }
  },
}

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  forgotPasswordTemplate,
  verifyEmailTemplate,
  welcomeTemplate,
  testEmailTemplate,
  digestTemplate,
]

export const EMAIL_TEMPLATE_SLUGS: readonly string[] = EMAIL_TEMPLATES.map(
  (template) => template.slug,
)

export const templateBySlug = (slug: string | null | undefined): EmailTemplate | undefined =>
  EMAIL_TEMPLATES.find((template) => template.slug === slug)

/** Render one template, or throw a sentence that names what is wrong with the slug. */
export const renderTemplate = (
  slug: string,
  brand: EmailBrand,
  data: EmailData,
): RenderedEmail => {
  const template = templateBySlug(slug)
  if (!template) {
    throw new Error(
      `There is no email template called “${slug}”. The templates are: ${EMAIL_TEMPLATE_SLUGS.join(', ')}.`,
    )
  }
  return template.render(brand, data)
}
