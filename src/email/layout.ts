import type { EmailBrand } from './brand'

/**
 * The HTML shell every email from this site is poured into.
 *
 * Written the way email has to be written, which is not the way the rest of this repository is
 * written: tables for layout, inline styles on every element, no stylesheet, no script, no external
 * image. Gmail strips `<style>` in some contexts, Outlook 2016 still renders with the Word engine,
 * and a `flex` layout arrives as a stack of unstyled text. Nothing here is a component and nothing
 * is shared with the admin UI for that reason — an email template that looks like the site's React
 * is an email template that breaks in Outlook.
 *
 * Every interpolated value goes through `escapeHtml`. The values are a person's name, a site name an
 * editor typed, and a subject line, all of which can contain `<`; an unescaped one is an email whose
 * layout is decided by its own content.
 */

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** A URL that is safe to put in an `href`: http(s) only, and quoted. */
export const safeHref = (url: string): string => {
  const trimmed = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(trimmed)) return '#'
  return escapeHtml(trimmed)
}

export type EmailSection = {
  heading?: string
  /** Paragraphs, already plain text. */
  paragraphs?: string[]
  /** Raw HTML for the parts a template builds itself (a definition list, a table of numbers). */
  html?: string
}

export type EmailLayout = {
  /**
   * The template's slug, written into the document as `data-pocms-template`.
   *
   * Payload builds its own auth emails from `generateEmailHTML` and sends them itself, so there is no
   * header to attach and no call site to annotate: the marker in the document is how the logging
   * adapter can still say *which* email a password reset was. Invisible to the reader, and it is the
   * only thing this layout adds that is not for the recipient.
   */
  template?: string
  /** The one line above the subject in some clients. */
  preheader?: string
  heading: string
  sections: EmailSection[]
  /** The button, when the email has one thing to do. */
  callToAction?: { label: string; url: string }
  /** Small print under the body: why the reader got this, and where to write. */
  footer?: string[]
}

const paragraph = (text: string): string =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${text}</p>`

/**
 * Render a complete email document.
 *
 * 600 px wide, centred, white on a light grey ground, one accent colour for the heading rule and the
 * button. The text version is the caller's job (`text` beside `html`), because a plain-text body that
 * is generated from HTML reads like a markup dump.
 */
export const renderEmailLayout = (brand: EmailBrand, layout: EmailLayout): string => {
  const accent = brand.accent || '#4f46e5'
  const preheader = layout.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">${escapeHtml(layout.preheader)}</div>`
    : ''

  const body = layout.sections
    .map((section) => {
      const heading = section.heading
        ? `<h2 style="margin:0 0 8px;font-size:16px;line-height:1.4;color:#111827;">${escapeHtml(section.heading)}</h2>`
        : ''
      const paragraphs = (section.paragraphs ?? [])
        .filter((text) => text.trim().length > 0)
        .map((text) => paragraph(escapeHtml(text)))
        .join('')
      return `<td style="padding:0;">${heading}${paragraphs}${section.html ?? ''}</td>`
    })
    .map((cell) => `<tr><td style="padding:0 0 4px;">${cell}</td></tr>`)
    .join('')

  const cta = layout.callToAction
    ? `<tr>
        <td style="padding:8px 0 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="padding:0;">
                <a href="${safeHref(layout.callToAction.url)}"
                   style="display:inline-block;padding:12px 24px;border-radius:8px;background:${escapeHtml(accent)};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                  ${escapeHtml(layout.callToAction.label)}
                </a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:12px 0 0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">
                  ${escapeHtml(layout.callToAction.label)}: ${escapeHtml(layout.callToAction.url)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  const footerLines = layout.footer ?? []
  const support = brand.supportEmail
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
         Questions? Write to <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${escapeHtml(accent)};">${escapeHtml(brand.supportEmail)}</a>.
       </p>`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escapeHtml(layout.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${
      layout.template ? ` data-pocms-template="${escapeHtml(layout.template)}"` : ''
    } style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:20px 28px;border-bottom:3px solid ${escapeHtml(accent)};background:#ffffff;">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">
                  ${escapeHtml(brand.siteName)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#111827;">
                  ${escapeHtml(layout.heading)}
                </h1>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${body}
                  ${cta}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid #e5e7eb;background:#f9fafb;">
                ${footerLines
                  .map(
                    (line) =>
                      `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#6b7280;">${escapeHtml(line)}</p>`,
                  )
                  .join('')}
                ${support}
                ${brand.siteUrl
                  ? `<p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">
                       <a href="${safeHref(brand.siteUrl)}" style="color:#9ca3af;">${escapeHtml(brand.siteUrl.replace(/^https?:\/\//, ''))}</a>
                     </p>`
                  : ''}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
            Sent by ${escapeHtml(brand.siteName)}${brand.fromAddress ? ` from ${escapeHtml(brand.fromAddress)}` : ''}.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`
}

/** The template slug an email document carries, or null when it is not one of ours. */
export const templateMarkerOf = (html: unknown): string | null => {
  const text = typeof html === 'string' ? html : html instanceof Buffer ? html.toString('utf8') : ''
  if (!text) return null
  const match = /data-pocms-template="([a-z0-9-]+)"/i.exec(text)
  return match?.[1] ? match[1].toLowerCase() : null
}

/** A definition list, for the small tables of facts (what changed, what a run counted). */
export const factTable = (rows: { label: string; value: string }[]): string => {
  if (rows.length === 0) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    ${rows
      .map(
        (row) => `<tr>
        <td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:40%;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;word-break:break-word;">${escapeHtml(row.value)}</td>
      </tr>`,
      )
      .join('')}
  </table>`
}
