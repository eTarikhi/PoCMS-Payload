'use client'

import { usePathname } from 'next/navigation'
import React, { useEffect, useRef, useSyncExternalStore } from 'react'

import {
  type CustomCodeScope,
  type CustomLinkTagItem,
  type CustomMetaTagItem,
  type CustomScriptStrategy,
  matchesCustomCodeScope,
  type ParsedScriptDescriptor,
  type ParsedStyleDescriptor,
  type ParsedTagDescriptor,
} from '@/app/(frontend)/lib/custom-code'

const emptySubscribe = () => () => {}

function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}

function useIsPreviewIframe(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return window.self !== window.top
      } catch {
        return true
      }
    },
    () => false,
  )
}

const EXECUTED_PERSISTENT_SCRIPTS = new Set<string>()

function createDomScriptElement(descriptor: ParsedScriptDescriptor): HTMLScriptElement {
  const scriptEl = document.createElement('script')
  scriptEl.setAttribute('data-pocms-custom-script', descriptor.id)

  for (const [key, value] of Object.entries(descriptor.attributes)) {
    if (value === false) continue
    const attrName =
      key === 'crossOrigin'
        ? 'crossorigin'
        : key === 'referrerPolicy'
          ? 'referrerpolicy'
          : key === 'fetchPriority'
            ? 'fetchpriority'
            : key === 'noModule'
              ? 'nomodule'
              : key === 'charSet'
                ? 'charset'
                : key
    if (value === true) {
      scriptEl.setAttribute(attrName, '')
    } else {
      scriptEl.setAttribute(attrName, String(value))
    }
  }

  if (descriptor.src) {
    scriptEl.src = descriptor.src
  } else if (descriptor.inlineCode) {
    scriptEl.text = descriptor.inlineCode
  }

  return scriptEl
}

function scheduleLazyCallback(cb: () => void): () => void {
  let cancelled = false
  let idleId: number | null = null
  let timerId: ReturnType<typeof setTimeout> | null = null

  const run = () => {
    if (cancelled) return
    const ric = (
      window as Window & {
        requestIdleCallback?: (fn: () => void) => number
      }
    ).requestIdleCallback
    if (typeof ric === 'function') {
      idleId = ric(() => {
        if (!cancelled) cb()
      })
    } else {
      timerId = setTimeout(() => {
        if (!cancelled) cb()
      }, 1)
    }
  }

  if (document.readyState === 'complete') {
    run()
  } else {
    window.addEventListener('load', run, { once: true })
  }

  return () => {
    cancelled = true
    window.removeEventListener('load', run)
    const cic = (
      window as Window & {
        cancelIdleCallback?: (id: number) => void
      }
    ).cancelIdleCallback
    if (idleId !== null && typeof cic === 'function') {
      cic(idleId)
    }
    if (timerId !== null) {
      clearTimeout(timerId)
    }
  }
}

export type CustomHeadClientProps = {
  skipInPreview: boolean
  scopedMetaTags: CustomMetaTagItem[]
  scopedLinkTags: CustomLinkTagItem[]
  scopedCss?: { scope: CustomCodeScope; css: string } | null
  headSnippetScope: CustomCodeScope
  scopedParsedHead?: {
    metas: ParsedTagDescriptor[]
    links: ParsedTagDescriptor[]
    styles: ParsedStyleDescriptor[]
  } | null
  headScripts: ParsedScriptDescriptor[]
}

export function CustomHeadClient({
  skipInPreview,
  scopedMetaTags,
  scopedLinkTags,
  scopedCss,
  headSnippetScope,
  scopedParsedHead,
  headScripts,
}: CustomHeadClientProps) {
  const pathname = usePathname() ?? '/'
  const isMounted = useIsMounted()
  const isPreviewIframe = useIsPreviewIframe()

  const suppressForPreview = skipInPreview && isPreviewIframe
  const headScopeActive = matchesCustomCodeScope(headSnippetScope, pathname)

  useEffect(() => {
    if (suppressForPreview || !headScopeActive || headScripts.length === 0) return

    const appended: HTMLScriptElement[] = []
    for (const descriptor of headScripts) {
      if (
        headSnippetScope === 'all' &&
        descriptor.src &&
        EXECUTED_PERSISTENT_SCRIPTS.has(descriptor.id)
      ) {
        continue
      }
      const existing = document.head.querySelector(
        `script[data-pocms-custom-script="${descriptor.id}"]`,
      )
      if (existing) continue

      const el = createDomScriptElement(descriptor)
      document.head.appendChild(el)
      appended.push(el)
      if (headSnippetScope === 'all' && descriptor.src) {
        EXECUTED_PERSISTENT_SCRIPTS.add(descriptor.id)
      }
    }

    return () => {
      if (headSnippetScope !== 'all') {
        for (const el of appended) {
          el.remove()
        }
      }
    }
  }, [headScopeActive, headScripts, headSnippetScope, suppressForPreview])

  if (!isMounted || suppressForPreview) return null

  const activeMetas = scopedMetaTags.filter((item) => matchesCustomCodeScope(item.scope, pathname))
  const activeLinks = scopedLinkTags.filter((item) => matchesCustomCodeScope(item.scope, pathname))
  const showScopedCss = Boolean(
    scopedCss && scopedCss.css && matchesCustomCodeScope(scopedCss.scope, pathname),
  )
  const showScopedParsedHead = Boolean(scopedParsedHead && headScopeActive)

  return (
    <>
      {activeMetas.map((meta) => {
        if (meta.attribute === 'property') {
          return <meta key={meta.id} property={meta.key} content={meta.content} />
        }
        if (meta.attribute === 'http-equiv') {
          return <meta key={meta.id} httpEquiv={meta.key} content={meta.content} />
        }
        return <meta key={meta.id} name={meta.key} content={meta.content} />
      })}
      {activeLinks.map((link) => (
        <link
          key={link.id}
          rel={link.rel}
          href={link.href}
          {...(link.as ? { as: link.as } : {})}
          {...(link.type ? { type: link.type } : {})}
          {...(link.crossOrigin ? { crossOrigin: link.crossOrigin } : {})}
        />
      ))}
      {showScopedParsedHead && scopedParsedHead
        ? scopedParsedHead.metas.map((m) => <meta key={m.id} {...m.attributes} />)
        : null}
      {showScopedParsedHead && scopedParsedHead
        ? scopedParsedHead.links.map((l) => <link key={l.id} {...l.attributes} />)
        : null}
      {showScopedParsedHead && scopedParsedHead
        ? scopedParsedHead.styles.map((s) => (
            <style
              key={s.id}
              {...s.attributes}
              dangerouslySetInnerHTML={{ __html: s.css }}
            />
          ))
        : null}
      {showScopedCss && scopedCss ? (
        <style
          id="pocms-custom-css-scoped"
          dangerouslySetInnerHTML={{ __html: scopedCss.css }}
        />
      ) : null}
    </>
  )
}

export type CustomSlotClientProps = {
  slotId: 'body-start' | 'after-footer' | 'body-end'
  scope: CustomCodeScope
  skipInPreview: boolean
  strategy?: CustomScriptStrategy
  htmlWithoutScripts: string
  scripts: ParsedScriptDescriptor[]
}

export function CustomSlotClient({
  slotId,
  scope,
  skipInPreview,
  strategy = 'afterInteractive',
  htmlWithoutScripts,
  scripts,
}: CustomSlotClientProps) {
  const pathname = usePathname() ?? '/'
  const isMounted = useIsMounted()
  const isPreviewIframe = useIsPreviewIframe()
  const scriptHostRef = useRef<HTMLDivElement | null>(null)

  const suppressForPreview = skipInPreview && isPreviewIframe
  const scopeMatches = scope === 'all' ? true : isMounted && matchesCustomCodeScope(scope, pathname)
  const shouldRender = !suppressForPreview && scopeMatches

  useEffect(() => {
    if (!shouldRender || scripts.length === 0) return
    const host = scriptHostRef.current ?? document.body
    if (!host) return

    const appended: HTMLScriptElement[] = []

    const mountScripts = () => {
      for (const descriptor of scripts) {
        if (
          scope === 'all' &&
          descriptor.src &&
          EXECUTED_PERSISTENT_SCRIPTS.has(descriptor.id)
        ) {
          continue
        }
        const existing = host.querySelector(
          `script[data-pocms-custom-script="${descriptor.id}"]`,
        )
        if (existing) continue

        const el = createDomScriptElement(descriptor)
        host.appendChild(el)
        appended.push(el)
        if (scope === 'all' && descriptor.src) {
          EXECUTED_PERSISTENT_SCRIPTS.add(descriptor.id)
        }
      }
    }

    let cancelLazy: (() => void) | null = null
    if (strategy === 'lazyOnload') {
      cancelLazy = scheduleLazyCallback(mountScripts)
    } else {
      mountScripts()
    }

    return () => {
      if (cancelLazy) cancelLazy()
      if (scope !== 'all') {
        for (const el of appended) {
          el.remove()
        }
      }
    }
  }, [scope, scripts, shouldRender, strategy])

  if (!shouldRender) return null
  if (!htmlWithoutScripts && scripts.length === 0) return null

  return (
    <div data-pocms-custom-slot={slotId}>
      {htmlWithoutScripts ? (
        <div
          data-pocms-custom-html={slotId}
          dangerouslySetInnerHTML={{ __html: htmlWithoutScripts }}
        />
      ) : null}
      {scripts.length > 0 ? (
        <div ref={scriptHostRef} data-pocms-custom-scripts={slotId} hidden />
      ) : null}
    </div>
  )
}
