import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

let mockedPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => mockedPathname,
}))

import config from '@/payload.config'
import {
  canManageCustomCode,
  NO_PERMISSIONS,
  type EffectivePermissions,
} from '@/access/permissions'
import { customCodeFieldAccess, customCodeGlobalAccess } from '@/access/roles'
import {
  CustomAfterFooterSlot,
  CustomBodyEndSlot,
  CustomBodyStartSlot,
  CustomHeadSlot,
} from '@/app/(frontend)/components/seo/CustomCodeInjection'
import {
  DEFAULT_CUSTOM_CODE,
  hasAnyCustomCodeConfigured,
  mapCustomCode,
  matchesCustomCodeScope,
  parseHeadHtmlSnippet,
  sanitizeStyleContent,
  splitHtmlAndScripts,
} from '@/app/(frontend)/lib/custom-code'
import { CACHE_TAGS, revalidateGlobalBySlug } from '@/app/(frontend)/lib/revalidate'

afterEach(() => {
  mockedPathname = '/'
  cleanup()
  vi.unstubAllEnvs()
  document.head
    .querySelectorAll('script[data-pocms-custom-script]')
    .forEach((el) => el.remove())
})

const buildUser = (opts: {
  fullAccess?: boolean
  levels?: EffectivePermissions['levels']
  capabilities?: EffectivePermissions['capabilities']
}) => ({
  id: 10,
  email: 'user@vtarikhi.com',
  permissions: {
    ...NO_PERMISSIONS,
    fullAccess: Boolean(opts.fullAccess),
    roles: opts.fullAccess ? ['Administrator'] : ['Custom'],
    levels: opts.levels ?? {},
    capabilities: opts.capabilities ?? [],
  },
})

describe('Site-Wide Custom Code Global (Head, CSS, After-Footer, Body Scripts)', () => {
  it('registers custom-code global with Monaco code fields, 10-version history, and dual RBAC', async () => {
    const sanitized = await config
    const customCodeGlobal = sanitized.globals.find((g) => g.slug === 'custom-code')
    expect(customCodeGlobal).toBeDefined()
    expect(customCodeGlobal?.admin.group).toBe('Site settings')
    expect((customCodeGlobal?.versions as { max?: number } | undefined)?.max).toBe(10)

    const adminUser = buildUser({ fullAccess: true })
    const ordinaryEditor = buildUser({
      levels: { 'custom-code': 'edit' },
      capabilities: [],
    })
    const capabilityOnlyUser = buildUser({
      levels: { 'custom-code': 'read' },
      capabilities: ['manageCustomCode'],
    })
    const delegatedSpecialist = buildUser({
      levels: { 'custom-code': 'edit' },
      capabilities: ['manageCustomCode'],
    })

    expect(canManageCustomCode(adminUser)).toBe(true)
    expect(canManageCustomCode(ordinaryEditor)).toBe(false)
    expect(canManageCustomCode(capabilityOnlyUser)).toBe(false)
    expect(canManageCustomCode(delegatedSpecialist)).toBe(true)

    // Anonymous REST/GraphQL read is denied; authenticated read with level >= read is allowed
    expect(
      customCodeGlobalAccess.read({ req: { user: null } as unknown as PayloadRequest }),
    ).toBe(false)
    expect(
      customCodeGlobalAccess.read({
        req: { user: capabilityOnlyUser } as unknown as PayloadRequest,
      }),
    ).toBe(true)
    expect(
      customCodeGlobalAccess.update({
        req: { user: ordinaryEditor } as unknown as PayloadRequest,
      }),
    ).toBe(false)
    expect(
      customCodeGlobalAccess.update({
        req: { user: delegatedSpecialist } as unknown as PayloadRequest,
      }),
    ).toBe(true)
    expect(
      customCodeFieldAccess.update({
        req: { user: ordinaryEditor } as unknown as PayloadRequest,
      }),
    ).toBe(false)
    expect(
      customCodeFieldAccess.update({
        req: { user: adminUser } as unknown as PayloadRequest,
      }),
    ).toBe(true)
  })

  it('sanitizes CSS </style> breakouts, blocks unsafe link/script protocols, and parses head HTML cleanly', () => {
    const css = sanitizeStyleContent(
      '<style>.banner::after { content: "</style><script>alert(1)</script>"; }</style>',
    )
    expect(css).not.toContain('</style>')
    expect(css).toContain('\\3c /style>')

    const parsed = parseHeadHtmlSnippet(`
      <!-- Analytics & verification -->
      <meta name="google-site-verification" content="verify-token-99" onload="evil()" />
      <link rel="preconnect" href="https://plausible.io" crossorigin="anonymous" />
      <link rel="stylesheet" href="javascript:alert(1)" />
      <style media="screen">body { --accent: #ffc448; }</style>
      <script defer data-domain="vtarikhi.com" src="https://plausible.io/js/script.js"></script>
      <script>window.__POCMS_HEAD_INLINE = 42;</script>
    `)

    expect(parsed.metas).toHaveLength(1)
    expect(parsed.metas[0]?.attributes).toEqual({
      name: 'google-site-verification',
      content: 'verify-token-99',
    })
    // Unsafe javascript: href link was dropped; valid https preconnect link kept
    expect(parsed.links).toHaveLength(1)
    expect(parsed.links[0]?.attributes).toEqual({
      rel: 'preconnect',
      href: 'https://plausible.io',
      crossOrigin: 'anonymous',
    })
    expect(parsed.styles).toHaveLength(1)
    expect(parsed.styles[0]?.css).toContain('--accent: #ffc448')
    expect(parsed.scripts).toHaveLength(2)
    expect(parsed.scripts[0]?.src).toBe('https://plausible.io/js/script.js')
    expect(parsed.scripts[0]?.attributes).toMatchObject({
      defer: true,
      'data-domain': 'vtarikhi.com',
    })
    expect(parsed.scripts[1]?.inlineCode).toContain('window.__POCMS_HEAD_INLINE = 42;')

    const split = splitHtmlAndScripts(
      '<div class="footer-badge">Verified</div><script>window.__AFTER_FOOTER = true;</script>',
      'window.__EXTRA_JS = "ok";',
      'test-footer',
    )
    expect(split.htmlWithoutScripts).toBe('<div class="footer-badge">Verified</div>')
    expect(split.scripts).toHaveLength(2)
  })

  it('matches route scopes accurately and emits zero DOM output by default (keeping Home / untouched)', () => {
    expect(matchesCustomCodeScope('all', '/')).toBe(true)
    expect(matchesCustomCodeScope('inner', '/')).toBe(false)
    expect(matchesCustomCodeScope('inner', '/articles')).toBe(true)
    expect(matchesCustomCodeScope('home', '/')).toBe(true)
    expect(matchesCustomCodeScope('home', '/projects')).toBe(false)
    expect(matchesCustomCodeScope('articles', '/articles/my-post/')).toBe(true)
    expect(matchesCustomCodeScope('articles', '/projects')).toBe(false)
    expect(matchesCustomCodeScope('projects', '/projects/pocms')).toBe(true)
    expect(matchesCustomCodeScope('contact', '/contact?form=request-cv')).toBe(true)

    expect(hasAnyCustomCodeConfigured(DEFAULT_CUSTOM_CODE)).toBe(false)

    const emptyHeadMarkup = renderToStaticMarkup(
      React.createElement(CustomHeadSlot, { customCode: DEFAULT_CUSTOM_CODE }),
    )
    const emptyStartMarkup = renderToStaticMarkup(
      React.createElement(CustomBodyStartSlot, { customCode: DEFAULT_CUSTOM_CODE }),
    )
    const emptyFooterMarkup = renderToStaticMarkup(
      React.createElement(CustomAfterFooterSlot, { customCode: DEFAULT_CUSTOM_CODE }),
    )
    const emptyEndMarkup = renderToStaticMarkup(
      React.createElement(CustomBodyEndSlot, { customCode: DEFAULT_CUSTOM_CODE }),
    )

    expect(emptyHeadMarkup).toBe('')
    expect(emptyStartMarkup).toBe('')
    expect(emptyFooterMarkup).toBe('')
    expect(emptyEndMarkup).toBe('')
  })

  it('renders SSR <head> tags without wrapper divs, executes after-footer & body scripts, honors scope & emergency kill-switch', () => {
    const mapped = mapCustomCode({
      enabled: true,
      skipInPreview: true,
      metaTags: [
        {
          id: 'm1',
          enabled: true,
          attribute: 'name',
          key: 'msvalidate.01',
          content: 'BING123',
          scope: 'all',
        },
        {
          id: 'm2',
          enabled: true,
          attribute: 'property',
          key: 'og:see_also',
          content: 'https://github.com/eTarikhi',
          scope: 'all',
        },
      ],
      linkTags: [
        {
          id: 'l1',
          enabled: true,
          rel: 'me',
          href: 'https://github.com/eTarikhi',
          scope: 'all',
        },
      ],
      headCode: {
        enabled: true,
        scope: 'all',
        html: '<meta http-equiv="x-dns-prefetch-control" content="on" />',
      },
      customCss: {
        enabled: true,
        scope: 'all',
        css: '.custom-highlight { border-color: #ffc448; }',
      },
      afterFooter: {
        enabled: true,
        scope: 'inner',
        html: '<aside id="custom-footer-widget">Cookie Notice</aside>',
        js: 'window.__POCMS_FOOTER_RAN = (window.__POCMS_FOOTER_RAN || 0) + 1;',
      },
      bodyStart: {
        enabled: true,
        scope: 'all',
        html: '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXX"></iframe></noscript>',
      },
      bodyEnd: {
        enabled: true,
        scope: 'all',
        strategy: 'afterInteractive',
        html: '<div id="body-end-marker">End</div>',
        js: 'window.__POCMS_BODY_END_RAN = true;',
      },
    })

    // 1. SSR <head> markup contains direct <meta>, <link>, and <style> elements with NO <div> wrapper
    const headHtml = renderToStaticMarkup(
      React.createElement(CustomHeadSlot, { customCode: mapped }),
    )
    expect(headHtml).toContain('<meta name="msvalidate.01" content="BING123"/>')
    expect(headHtml).toContain(
      '<meta property="og:see_also" content="https://github.com/eTarikhi"/>',
    )
    expect(headHtml).toContain('<link rel="me" href="https://github.com/eTarikhi"/>')
    expect(headHtml).toContain('<meta http-equiv="x-dns-prefetch-control" content="on"/>')
    expect(headHtml).toContain(
      '<style id="pocms-custom-css">.custom-highlight { border-color: #ffc448; }</style>',
    )
    expect(headHtml).not.toContain('<div')

    // 2. Scope 'inner' excludes Home (/) and mounts HTML + <script> sibling cleanly on '/articles'
    mockedPathname = '/'
    const homeFooterRender = render(
      React.createElement(CustomAfterFooterSlot, { customCode: mapped }),
    )
    expect(homeFooterRender.container.innerHTML).toBe('')
    homeFooterRender.unmount()

    mockedPathname = '/articles'
    const articlesFooterRender = render(
      React.createElement(CustomAfterFooterSlot, { customCode: mapped }),
    )
    expect(articlesFooterRender.container.querySelector('#custom-footer-widget')?.textContent).toBe(
      'Cookie Notice',
    )
    const mountedFooterScript = articlesFooterRender.container.querySelector(
      '[data-pocms-custom-scripts="after-footer"] script[data-pocms-custom-script]',
    ) as HTMLScriptElement | null
    expect(mountedFooterScript).not.toBeNull()
    expect(mountedFooterScript?.text).toContain('window.__POCMS_FOOTER_RAN')
    articlesFooterRender.unmount()

    // 3. BodyStart and BodyEnd render HTML and mount <script> elements in dedicated sibling host
    const bodyStartRender = render(
      React.createElement(CustomBodyStartSlot, { customCode: mapped }),
    )
    expect(bodyStartRender.container.innerHTML).toContain('googletagmanager.com/ns.html')
    bodyStartRender.unmount()

    const bodyEndRender = render(React.createElement(CustomBodyEndSlot, { customCode: mapped }))
    expect(bodyEndRender.container.querySelector('#body-end-marker')?.textContent).toBe('End')
    const mountedBodyEndScript = bodyEndRender.container.querySelector(
      '[data-pocms-custom-scripts="body-end"] script[data-pocms-custom-script]',
    ) as HTMLScriptElement | null
    expect(mountedBodyEndScript).not.toBeNull()
    expect(mountedBodyEndScript?.text).toContain('window.__POCMS_BODY_END_RAN = true;')
    bodyEndRender.unmount()

    // 4. Live Preview iframe detection (window.self !== window.top) suppresses slots when skipInPreview=true
    const originalTop = Object.getOwnPropertyDescriptor(window, 'top')
    Object.defineProperty(window, 'top', {
      configurable: true,
      get: () => ({}) as Window,
    })
    try {
      const previewRender = render(React.createElement(CustomBodyEndSlot, { customCode: mapped }))
      expect(previewRender.container.innerHTML).toBe('')
      previewRender.unmount()
    } finally {
      if (originalTop) {
        Object.defineProperty(window, 'top', originalTop)
      }
    }

    // 5. Emergency environment kill-switch suppresses all slots immediately
    vi.stubEnv('DISABLE_CUSTOM_CODE_INJECTION', 'true')
    expect(
      renderToStaticMarkup(React.createElement(CustomHeadSlot, { customCode: mapped })),
    ).toBe('')
    expect(
      renderToStaticMarkup(React.createElement(CustomAfterFooterSlot, { customCode: mapped })),
    ).toBe('')
    expect(
      renderToStaticMarkup(React.createElement(CustomBodyEndSlot, { customCode: mapped })),
    ).toBe('')

    // 5. Surgical cache tag revalidation includes global:custom-code, portfolio:chrome, portfolio:home
    const tags = revalidateGlobalBySlug('custom-code')
    expect(tags).toEqual([
      CACHE_TAGS.globalCustomCode,
      CACHE_TAGS.chrome,
      CACHE_TAGS.home,
    ])
  })
})
