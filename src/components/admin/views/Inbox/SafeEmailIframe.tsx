'use client'

import React, { useMemo, useState } from 'react'

import { Button } from '@/components/admin/elements/Button'
import { revealRemoteImagesInSanitizedHtml } from '@/plugins/mailInbox/services/mimeSanitizer'

export type SafeEmailIframeProps = {
  sanitizedHtml: string
  allowRemoteImages: boolean
  subject?: string
}

/**
 * Renders untrusted (already server-sanitized) email HTML inside a cross-origin-isolated
 * `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox">`.
 *
 * Security invariants:
 * - Never sets `allow-same-origin` or `allow-scripts`, guaranteeing zero access to Admin cookies,
 *   localStorage, or parent window globals.
 * - Sets `referrerPolicy="no-referrer"` so clicking links or opting into remote images never leaks
 *   the `/admin/inbox` URL.
 */
export function SafeEmailIframe({
  sanitizedHtml,
  allowRemoteImages,
  subject,
}: SafeEmailIframeProps) {
  const [expanded, setExpanded] = useState(false)

  const effectiveBody = useMemo(() => {
    if (!sanitizedHtml) return ''
    return allowRemoteImages
      ? revealRemoteImagesInSanitizedHtml(sanitizedHtml)
      : sanitizedHtml
  }, [sanitizedHtml, allowRemoteImages])

  const estimatedHeight = useMemo(() => {
    const plainApprox = effectiveBody.replace(/<[^>]+>/g, '').length
    const lineBreaks = (effectiveBody.match(/<(br|p|tr|div|li|blockquote)\b/gi) ?? []).length
    const computed = Math.max(140, Math.min(540, Math.round(plainApprox * 0.32 + lineBreaks * 24 + 72)))
    return expanded ? Math.max(computed, 680) : computed
  }, [effectiveBody, expanded])

  const srcDoc = useMemo(
    () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<style>
  :root { color-scheme: light; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #18181b;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .mail-body {
    padding: 14px 16px;
  }
  p { margin: 0 0 10px; }
  p:last-child { margin-bottom: 0; }
  a { color: #2563eb; text-decoration: underline; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  img[data-remote-src] {
    display: inline-block;
    min-width: 24px;
    min-height: 18px;
    padding: 2px 6px;
    border: 1px dashed #d4d4d8;
    background: #fafafa;
    color: #71717a;
    font-size: 11px;
  }
  img[data-tracker-pixel="true"] { display: none !important; }
  blockquote {
    margin: 10px 0;
    padding: 4px 0 4px 12px;
    border-left: 3px solid #e4e4e7;
    color: #52525b;
  }
  pre, code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12.5px;
    background: #f4f4f5;
    border-radius: 4px;
  }
  pre { padding: 10px; overflow-x: auto; }
  code { padding: 1px 4px; }
  table { max-width: 100%; border-collapse: collapse; }
</style>
</head>
<body>
  <div class="mail-body">${effectiveBody}</div>
</body>
</html>`,
    [effectiveBody],
  )

  const isLongEmail = effectiveBody.length > 1800

  return (
    <div className="acn:overflow-hidden acn:rounded-lg acn:border acn:border-border acn:bg-white">
      <iframe
        title={subject ? `Email message: ${subject}` : 'Email message content'}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ height: `${estimatedHeight}px` }}
        className="acn:block acn:w-full acn:border-0 acn:bg-white"
      />
      {isLongEmail ? (
        <div className="acn:flex acn:justify-end acn:border-t acn:border-zinc-200 acn:bg-zinc-50 acn:px-3 acn:py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            className="acn:h-6 acn:px-2 acn:text-xs acn:text-zinc-600"
          >
            {expanded ? 'Compact height' : 'Expand full height'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
