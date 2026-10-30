import type { Field, GlobalConfig } from 'payload'

import { customCodeFieldAccess, customCodeGlobalAccess, hiddenWithout } from '../access/roles'
import { chromeAfterChange } from '../app/(frontend)/lib/hooks'
import { DEFAULT_MAX_VERSIONS_PER_DOC } from '../lib/versionRetentionShared'

const MONACO_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  lineNumbers: 'on' as const,
  wordWrap: 'on' as const,
  scrollBeyondLastLine: false,
  tabSize: 2,
}

export const CUSTOM_CODE_SCOPE_OPTIONS = [
  { label: 'All pages (Site-wide)', value: 'all' },
  { label: 'Inner pages only (Exclude Home /)', value: 'inner' },
  { label: 'Home page (/) only', value: 'home' },
  { label: 'Articles (/articles & /articles/[slug])', value: 'articles' },
  { label: 'Projects (/projects & /projects/[slug])', value: 'projects' },
  { label: 'Contact (/contact)', value: 'contact' },
] as const

const META_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/
const UNSAFE_HREF_PROTOCOL = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i

const buildScopeField = (width = '65%'): Field => ({
  name: 'scope',
  label: 'Target Pages',
  type: 'select',
  defaultValue: 'all',
  options: [...CUSTOM_CODE_SCOPE_OPTIONS],
  admin: {
    width,
    description: 'Choose whether this snippet loads across the whole site or on a specific section.',
  },
})

export const CustomCode: GlobalConfig = {
  slug: 'custom-code',
  label: 'Custom Code',
  versions: {
    max: DEFAULT_MAX_VERSIONS_PER_DOC,
  },
  hooks: {
    afterChange: [chromeAfterChange],
  },
  admin: {
    hidden: hiddenWithout('custom-code'),
    group: 'Site settings',
    description:
      'Inject custom <head> meta/link tags, site-wide CSS styles, after-footer widgets, and body scripts without editing source files.',
  },
  access: customCodeGlobalAccess,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'enabled',
          label: 'Enable Custom Code Injection',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            width: '50%',
            description:
              'Master switch. Turn off to temporarily pause all custom tags, styles, and scripts without deleting them.',
          },
        },
        {
          name: 'skipInPreview',
          label: 'Skip Scripts Inside Admin Live Preview',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            width: '50%',
            description:
              'Suppresses custom scripts and widgets when a page is rendered inside the Payload Admin Live Preview iframe.',
          },
        },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Head & Meta Tags',
          description:
            'Structured <meta> and <link> tags plus raw <head> HTML/script snippets (analytics, verification tags, font preconnects).',
          fields: [
            {
              name: 'metaTags',
              label: 'Custom Meta Tags',
              type: 'array',
              labels: { singular: 'Meta Tag', plural: 'Meta Tags' },
              admin: {
                initCollapsed: false,
                description:
                  'Structured <meta> tags emitted directly inside <head> (safe for search engine & social crawlers).',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      label: 'Active',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '15%' },
                    },
                    {
                      name: 'attribute',
                      label: 'Attribute Type',
                      type: 'select',
                      defaultValue: 'name',
                      options: [
                        { label: 'name="…"', value: 'name' },
                        { label: 'property="…" (Open Graph)', value: 'property' },
                        { label: 'http-equiv="…"', value: 'http-equiv' },
                      ],
                      admin: { width: '25%' },
                    },
                    {
                      name: 'key',
                      label: 'Key / Name',
                      type: 'text',
                      required: true,
                      validate: (value: unknown) => {
                        if (typeof value !== 'string' || !value.trim()) {
                          return 'Meta tag key is required.'
                        }
                        if (!META_KEY_PATTERN.test(value.trim())) {
                          return 'Use letters, numbers, dots, colons, underscores, or hyphens only (e.g. "google-site-verification" or "og:see_also").'
                        }
                        return true
                      },
                      admin: {
                        width: '30%',
                        placeholder: 'google-site-verification',
                      },
                    },
                    buildScopeField('30%'),
                  ],
                },
                {
                  name: 'content',
                  label: 'Content Value',
                  type: 'text',
                  required: true,
                  admin: {
                    placeholder: 'Meta content value',
                  },
                },
              ],
            },
            {
              name: 'linkTags',
              label: 'Custom Head Link Tags',
              type: 'array',
              labels: { singular: 'Link Tag', plural: 'Link Tags' },
              admin: {
                initCollapsed: true,
                description:
                  'Structured <link> tags inside <head> (e.g. rel="preconnect", external stylesheets, IndieWeb rel="me", or alternate feeds).',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      label: 'Active',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '15%' },
                    },
                    {
                      name: 'rel',
                      label: 'rel',
                      type: 'text',
                      required: true,
                      validate: (value: unknown) => {
                        if (typeof value !== 'string' || !value.trim()) {
                          return 'Link rel attribute is required.'
                        }
                        if (!/^[A-Za-z0-9_.\s-]+$/.test(value.trim())) {
                          return 'Enter a valid link rel value (e.g. "preconnect", "stylesheet", "me").'
                        }
                        return true
                      },
                      admin: {
                        width: '25%',
                        placeholder: 'preconnect',
                      },
                    },
                    {
                      name: 'href',
                      label: 'href',
                      type: 'text',
                      required: true,
                      validate: (value: unknown) => {
                        if (typeof value !== 'string' || !value.trim()) {
                          return 'Link href URL is required.'
                        }
                        if (UNSAFE_HREF_PROTOCOL.test(value)) {
                          return 'Unsafe URL protocol is not allowed in <link href>.'
                        }
                        return true
                      },
                      admin: {
                        width: '35%',
                        placeholder: 'https://plausible.io',
                      },
                    },
                    buildScopeField('25%'),
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'as',
                      label: 'as (optional)',
                      type: 'text',
                      admin: {
                        width: '34%',
                        placeholder: 'font, style, image…',
                      },
                    },
                    {
                      name: 'type',
                      label: 'MIME type (optional)',
                      type: 'text',
                      admin: {
                        width: '33%',
                        placeholder: 'font/woff2, text/css…',
                      },
                    },
                    {
                      name: 'crossOrigin',
                      label: 'crossorigin (optional)',
                      type: 'select',
                      defaultValue: '',
                      options: [
                        { label: 'None', value: '' },
                        { label: 'anonymous', value: 'anonymous' },
                        { label: 'use-credentials', value: 'use-credentials' },
                      ],
                      admin: { width: '33%' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'headCode',
              label: 'Raw <head> HTML & Scripts',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      label: 'Enable Raw <head> Snippet',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '35%' },
                    },
                    buildScopeField('65%'),
                  ],
                },
                {
                  name: 'html',
                  label: 'Head HTML (<meta>, <link>, <style>, <script>)',
                  type: 'code',
                  access: customCodeFieldAccess,
                  admin: {
                    language: 'html',
                    editorOptions: MONACO_EDITOR_OPTIONS,
                    description:
                      'Paste <meta>, <link>, <style>, or <script> snippets (e.g. Google Tag Manager, Plausible, Umami, Clarity). Parsed into native <head> elements without wrapper divs.',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Custom CSS',
          description:
            'Site-wide or section-scoped CSS stylesheet rules injected cleanly inside <head>.',
          fields: [
            {
              name: 'customCss',
              label: 'Custom Stylesheet',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      label: 'Enable Custom CSS',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '35%' },
                    },
                    buildScopeField('65%'),
                  ],
                },
                {
                  name: 'css',
                  label: 'CSS Rules',
                  type: 'code',
                  access: customCodeFieldAccess,
                  admin: {
                    language: 'css',
                    editorOptions: MONACO_EDITOR_OPTIONS,
                    description:
                      'Write standard CSS rules (no <style> tags needed). Select "Inner pages only" above if you want to leave the Home (/) page untouched.',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'After Footer',
          description:
            'Custom HTML widgets, badges, cookie banners, or scripts rendered immediately after <footer>.',
          fields: [
            {
              name: 'afterFooter',
              label: 'After-Footer Injection',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      label: 'Enable After-Footer Code',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '35%' },
                    },
                    buildScopeField('65%'),
                  ],
                },
                {
                  name: 'html',
                  label: 'After-Footer HTML & Embeds',
                  type: 'code',
                  access: customCodeFieldAccess,
                  admin: {
                    language: 'html',
                    editorOptions: MONACO_EDITOR_OPTIONS,
                    description:
                      'HTML markup or third-party <script> embeds rendered right after the site <footer>.',
                  },
                },
                {
                  name: 'js',
                  label: 'After-Footer JavaScript (optional)',
                  type: 'code',
                  access: customCodeFieldAccess,
                  admin: {
                    language: 'javascript',
                    editorOptions: MONACO_EDITOR_OPTIONS,
                    description:
                      'Optional standalone JavaScript (without <script> tags) executed after the footer markup mounts.',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Body Scripts',
          description:
            'Snippets placed immediately after opening <body> or right at the end of <body> (after body content).',
          fields: [
            {
              name: 'bodyStart',
              label: 'After Opening <body> (Body Start)',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      label: 'Enable Body-Start Snippet',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '35%' },
                    },
                    buildScopeField('65%'),
                  ],
                },
                {
                  name: 'html',
                  label: 'Body-Start HTML',
                  type: 'code',
                  access: customCodeFieldAccess,
                  admin: {
                    language: 'html',
                    editorOptions: MONACO_EDITOR_OPTIONS,
                    description:
                      'Rendered immediately inside <body> before page content (commonly used for Google Tag Manager <noscript> iframes).',
                  },
                },
              ],
            },
            {
              name: 'bodyEnd',
              label: 'After / End of <body> (Before </body>)',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      label: 'Enable Body-End Code',
                      type: 'checkbox',
                      defaultValue: true,
                      admin: { width: '30%' },
                    },
                    buildScopeField('35%'),
                    {
                      name: 'strategy',
                      label: 'Script Load Strategy',
                      type: 'select',
                      defaultValue: 'afterInteractive',
                      options: [
                        {
                          label: 'After Interactive (Hydrated)',
                          value: 'afterInteractive',
                        },
                        {
                          label: 'Lazy On Load (Idle)',
                          value: 'lazyOnload',
                        },
                      ],
                      admin: {
                        width: '35%',
                        description: 'Controls when body-end scripts execute.',
                      },
                    },
                  ],
                },
                {
                  name: 'html',
                  label: 'Body-End HTML & <script> Tags',
                  type: 'code',
                  access: customCodeFieldAccess,
                  admin: {
                    language: 'html',
                    editorOptions: MONACO_EDITOR_OPTIONS,
                    description:
                      'Custom HTML or <script> tags placed at the very end of <body> (browsers normalize content after </body> into the end of <body>).',
                  },
                },
                {
                  name: 'js',
                  label: 'Body-End JavaScript (optional)',
                  type: 'code',
                  access: customCodeFieldAccess,
                  admin: {
                    language: 'javascript',
                    editorOptions: MONACO_EDITOR_OPTIONS,
                    description:
                      'Optional standalone JavaScript (without <script> tags) executed at the end of <body>.',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
