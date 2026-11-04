import React from 'react'

import {
  type CustomCodeContent,
  isCustomCodeEmergencyDisabled,
  parseHeadHtmlSnippet,
  sanitizeStyleContent,
  splitHtmlAndScripts,
} from '@/app/(frontend)/lib/custom-code'

import { CustomHeadClient, CustomSlotClient } from './CustomCodeClient'

export type CustomCodeSlotProps = {
  customCode?: CustomCodeContent | null
}

/**
 * Emits site-wide `<meta>`, `<link>`, and `<style>` elements directly inside `<head>` on the server
 * (zero wrapper `<div>`, full crawler visibility, zero FOUC), and delegates `<head>` `<script>`s or
 * route-scoped tags to `CustomHeadClient`. Renders `null` when nothing is configured.
 */
export function CustomHeadSlot({ customCode }: CustomCodeSlotProps) {
  if (!customCode || !customCode.enabled || isCustomCodeEmergencyDisabled()) {
    return null
  }

  const activeMetas = customCode.metaTags.filter((m) => m.enabled && m.key && m.content)
  const serverMetas = activeMetas.filter((m) => m.scope === 'all')
  const scopedMetas = activeMetas.filter((m) => m.scope !== 'all')

  const activeLinks = customCode.linkTags.filter((l) => l.enabled && l.rel && l.href)
  const serverLinks = activeLinks.filter((l) => l.scope === 'all')
  const scopedLinks = activeLinks.filter((l) => l.scope !== 'all')

  const sanitizedCss = customCode.customCss.enabled
    ? sanitizeStyleContent(customCode.customCss.css)
    : ''
  const serverCss = customCode.customCss.scope === 'all' ? sanitizedCss : ''
  const scopedCss =
    sanitizedCss && customCode.customCss.scope !== 'all'
      ? { scope: customCode.customCss.scope, css: sanitizedCss }
      : null

  const parsedHead = customCode.headCode.enabled
    ? parseHeadHtmlSnippet(customCode.headCode.html)
    : { metas: [], links: [], styles: [], scripts: [] }

  const headIsAllScope = customCode.headCode.scope === 'all'
  const serverParsedHead = headIsAllScope ? parsedHead : null
  const scopedParsedHead =
    !headIsAllScope &&
    (parsedHead.metas.length > 0 || parsedHead.links.length > 0 || parsedHead.styles.length > 0)
      ? {
          metas: parsedHead.metas,
          links: parsedHead.links,
          styles: parsedHead.styles,
        }
      : null

  const needsClientHead =
    scopedMetas.length > 0 ||
    scopedLinks.length > 0 ||
    scopedCss !== null ||
    scopedParsedHead !== null ||
    parsedHead.scripts.length > 0

  const hasServerHead =
    serverMetas.length > 0 ||
    serverLinks.length > 0 ||
    Boolean(serverCss) ||
    Boolean(
      serverParsedHead &&
        (serverParsedHead.metas.length > 0 ||
          serverParsedHead.links.length > 0 ||
          serverParsedHead.styles.length > 0),
    )

  if (!hasServerHead && !needsClientHead) {
    return null
  }

  return (
    <>
      {serverMetas.map((meta) => {
        if (meta.attribute === 'property') {
          return <meta key={meta.id} property={meta.key} content={meta.content} />
        }
        if (meta.attribute === 'http-equiv') {
          return <meta key={meta.id} httpEquiv={meta.key} content={meta.content} />
        }
        return <meta key={meta.id} name={meta.key} content={meta.content} />
      })}
      {serverLinks.map((link) => (
        <link
          key={link.id}
          rel={link.rel}
          href={link.href}
          {...(link.as ? { as: link.as } : {})}
          {...(link.type ? { type: link.type } : {})}
          {...(link.crossOrigin ? { crossOrigin: link.crossOrigin } : {})}
        />
      ))}
      {serverParsedHead
        ? serverParsedHead.metas.map((m) => <meta key={m.id} {...m.attributes} />)
        : null}
      {serverParsedHead
        ? serverParsedHead.links.map((l) => <link key={l.id} {...l.attributes} />)
        : null}
      {serverParsedHead
        ? serverParsedHead.styles.map((s) => (
            <style
              key={s.id}
              {...s.attributes}
              dangerouslySetInnerHTML={{ __html: s.css }}
            />
          ))
        : null}
      {serverCss ? (
        <style id="pocms-custom-css" dangerouslySetInnerHTML={{ __html: serverCss }} />
      ) : null}
      {needsClientHead ? (
        <CustomHeadClient
          skipInPreview={customCode.skipInPreview}
          scopedMetaTags={scopedMetas}
          scopedLinkTags={scopedLinks}
          scopedCss={scopedCss}
          headSnippetScope={customCode.headCode.scope}
          scopedParsedHead={scopedParsedHead}
          headScripts={parsedHead.scripts}
        />
      ) : null}
    </>
  )
}

export function CustomBodyStartSlot({ customCode }: CustomCodeSlotProps) {
  if (
    !customCode ||
    !customCode.enabled ||
    !customCode.bodyStart.enabled ||
    isCustomCodeEmergencyDisabled()
  ) {
    return null
  }

  const { htmlWithoutScripts, scripts } = splitHtmlAndScripts(
    customCode.bodyStart.html,
    undefined,
    'pocms-body-start',
  )
  if (!htmlWithoutScripts && scripts.length === 0) return null

  return (
    <CustomSlotClient
      slotId="body-start"
      scope={customCode.bodyStart.scope}
      skipInPreview={customCode.skipInPreview}
      htmlWithoutScripts={htmlWithoutScripts}
      scripts={scripts}
    />
  )
}

export function CustomAfterFooterSlot({ customCode }: CustomCodeSlotProps) {
  if (
    !customCode ||
    !customCode.enabled ||
    !customCode.afterFooter.enabled ||
    isCustomCodeEmergencyDisabled()
  ) {
    return null
  }

  const { htmlWithoutScripts, scripts } = splitHtmlAndScripts(
    customCode.afterFooter.html,
    customCode.afterFooter.js,
    'pocms-after-footer',
  )
  if (!htmlWithoutScripts && scripts.length === 0) return null

  return (
    <CustomSlotClient
      slotId="after-footer"
      scope={customCode.afterFooter.scope}
      skipInPreview={customCode.skipInPreview}
      htmlWithoutScripts={htmlWithoutScripts}
      scripts={scripts}
    />
  )
}

export function CustomBodyEndSlot({ customCode }: CustomCodeSlotProps) {
  if (
    !customCode ||
    !customCode.enabled ||
    !customCode.bodyEnd.enabled ||
    isCustomCodeEmergencyDisabled()
  ) {
    return null
  }

  const { htmlWithoutScripts, scripts } = splitHtmlAndScripts(
    customCode.bodyEnd.html,
    customCode.bodyEnd.js,
    'pocms-body-end',
  )
  if (!htmlWithoutScripts && scripts.length === 0) return null

  return (
    <CustomSlotClient
      slotId="body-end"
      scope={customCode.bodyEnd.scope}
      skipInPreview={customCode.skipInPreview}
      strategy={customCode.bodyEnd.strategy}
      htmlWithoutScripts={htmlWithoutScripts}
      scripts={scripts}
    />
  )
}
