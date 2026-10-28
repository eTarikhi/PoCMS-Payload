import type { DefaultNodeTypes, SerializedBlockNode } from '@payloadcms/richtext-lexical'
import {
  type JSXConvertersFunction,
  LinkJSXConverter,
  RichText as PayloadRichText,
} from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'
import React from 'react'

import {
  extractNodePlainText,
  type LexicalStateLike,
  resolveInternalLinkDocHref,
} from '@/app/(frontend)/lib/lexical'
import { slugify } from '@/app/(frontend)/lib/slug'

import { CalloutBlock } from './CalloutBlock'
import { CodeBlock } from './CodeBlock'
import { CodeTabsBlockView, type RawCodeTabItem } from './CodeTabsBlockView'
import { DiagramBlockView } from './DiagramBlockView'
import { MediaBlockView } from './MediaBlockView'
import { type MetricCardItem, MetricsBlockView } from './MetricsBlockView'

type RichTextContentProps = {
  data: LexicalStateLike | null | undefined
  className?: string
}

/**
 * Renders Payload Lexical JSON on public pages using `@payloadcms/richtext-lexical/react`.
 *
 * Heading IDs are generated with the exact same `slugify` + duplicate counter algorithm as
 * `extractTableOfContents` in `lib/lexical.ts`, guaranteeing every Table of Contents anchor link
 * lands on its matching `<h2>` / `<h3>` / `<h4>` element.
 *
 * Internal relationship links (`articles` & `projects`) render through Next.js `<Link>` for
 * instant client-side prefetching and navigation.
 */
export function RichTextContent({ data, className }: RichTextContentProps) {
  if (!data?.root?.children?.length) return null

  const seenHeadingSlugs = new Map<string, number>()

  const nextHeadingId = (text: string): string => {
    const base = slugify(text) || 'section'
    const count = seenHeadingSlugs.get(base) ?? 0
    seenHeadingSlugs.set(base, count + 1)
    return count === 0 ? base : `${base}-${count + 1}`
  }

  const jsxConverters: JSXConvertersFunction<DefaultNodeTypes | SerializedBlockNode> = ({
    defaultConverters,
  }) => {
    const linkConverters = LinkJSXConverter({
      internalDocToHref: ({ linkNode }) =>
        resolveInternalLinkDocHref(
          linkNode.fields?.doc as { relationTo?: string; value?: unknown } | undefined,
        ),
    })

    return {
      ...defaultConverters,
      ...linkConverters,
      link: (args) => {
        const fields = args.node.fields
        const isInternal = fields?.linkType === 'internal'
        const href = isInternal
          ? resolveInternalLinkDocHref(
              fields?.doc as { relationTo?: string; value?: unknown } | undefined,
            )
          : fields?.url || '#'
        const children = args.nodesToJSX({ nodes: args.node.children })

        if (isInternal && href.startsWith('/')) {
          return (
            <Link
              href={href}
              target={fields?.newTab ? '_blank' : undefined}
              rel={fields?.newTab ? 'noopener noreferrer' : undefined}
            >
              {children}
            </Link>
          )
        }

        return typeof linkConverters.link === 'function' ? (
          linkConverters.link(args)
        ) : (
          <a
            href={href}
            target={fields?.newTab ? '_blank' : undefined}
            rel={fields?.newTab ? 'noopener noreferrer' : undefined}
          >
            {children}
          </a>
        )
      },
      heading: ({ node, nodesToJSX }) => {
        const tag = node.tag
        const children = nodesToJSX({ nodes: node.children })
        if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
          const text = extractNodePlainText(node as unknown as Record<string, unknown>)
          const id = nextHeadingId(text)
          return React.createElement(tag, { id, className: 'rich-heading' }, children)
        }
        return React.createElement(tag || 'h2', { className: 'rich-heading' }, children)
      },
      blocks: {
        ...defaultConverters.blocks,
        code: ({ node }: { node: SerializedBlockNode }) => {
          const fields = (node.fields ?? {}) as {
            code?: string
            language?: string
            filename?: string
            highlightLines?: string
          }
          if (!fields.code) return null
          return (
            <CodeBlock
              code={fields.code}
              language={fields.language}
              filename={fields.filename}
              highlightLines={fields.highlightLines}
            />
          )
        },
        codeTabs: ({ node }: { node: SerializedBlockNode }) => {
          const fields = (node.fields ?? {}) as {
            title?: string
            tabs?: RawCodeTabItem[]
          }
          return <CodeTabsBlockView title={fields.title} tabs={fields.tabs} />
        },
        callout: ({ node }: { node: SerializedBlockNode }) => {
          const fields = (node.fields ?? {}) as {
            variant?: 'info' | 'tip' | 'warning' | 'danger'
            title?: string
            content?: string
          }
          if (!fields.content) return null
          return (
            <CalloutBlock variant={fields.variant} title={fields.title} content={fields.content} />
          )
        },
        mediaBlock: ({ node }: { node: SerializedBlockNode }) => {
          const fields = (node.fields ?? {}) as {
            media?: unknown
            imageUrl?: string
            caption?: string
            size?: 'normal' | 'wide'
          }
          return (
            <MediaBlockView
              media={fields.media as never}
              imageUrl={fields.imageUrl}
              caption={fields.caption}
              size={fields.size}
            />
          )
        },
        metrics: ({ node }: { node: SerializedBlockNode }) => {
          const fields = (node.fields ?? {}) as {
            heading?: string
            items?: MetricCardItem[]
          }
          return <MetricsBlockView heading={fields.heading} items={fields.items} />
        },
        diagram: ({ node }: { node: SerializedBlockNode }) => {
          const fields = (node.fields ?? {}) as {
            title?: string
            engine?: 'mermaid' | 'ascii'
            code?: string
            caption?: string
          }
          return (
            <DiagramBlockView
              title={fields.title}
              engine={fields.engine}
              code={fields.code}
              caption={fields.caption}
            />
          )
        },
      },
    }
  }

  return (
    <div className={['rich-text-body', className].filter(Boolean).join(' ')}>
      <PayloadRichText data={data as never} converters={jsxConverters} />
    </div>
  )
}
