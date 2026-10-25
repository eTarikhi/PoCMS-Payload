import React from 'react'
import {
  RichText,
  type JSXConvertersFunction,
} from '@payloadcms/richtext-lexical/react'
import type { DefaultNodeTypes, SerializedBlockNode } from '@payloadcms/richtext-lexical'

import {
  createHeadingIdTracker,
  extractNodePlainText,
  type LexicalNodeLike,
} from '@/app/(frontend)/lib/lexical'
import type {
  CalloutBlockFields,
  CodeBlockFields,
  MediaBlockFields,
} from '@/payload-types'

import { CalloutBlock } from './CalloutBlock'
import { CodeBlock } from './CodeBlock'
import { MediaBlockView } from './MediaBlockView'

type RichTextBlockNodes =
  | SerializedBlockNode<CodeBlockFields>
  | SerializedBlockNode<CalloutBlockFields>
  | SerializedBlockNode<MediaBlockFields>

type NodeTypes = DefaultNodeTypes | RichTextBlockNodes

export type RichTextContentProps = {
  data: Parameters<typeof RichText>[0]['data']
  className?: string
}

export function RichTextContent({ data, className }: RichTextContentProps) {
  // Fresh tracker per render pass guarantees heading `id`s match `extractTableOfContents(data)`.
  const nextHeadingId = createHeadingIdTracker()

  const converters: JSXConvertersFunction<NodeTypes> = ({ defaultConverters }) => ({
    ...defaultConverters,
    heading: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children })
      const plainText = extractNodePlainText(node as unknown as LexicalNodeLike)
        .replace(/\s+/g, ' ')
        .trim()
      const id = plainText.length > 0 ? nextHeadingId(plainText) : undefined
      const tag = node.tag
      if (tag === 'h2') return <h2 id={id}>{children}</h2>
      if (tag === 'h3') return <h3 id={id}>{children}</h3>
      if (tag === 'h4') return <h4 id={id}>{children}</h4>
      if (tag === 'h5') return <h5 id={id}>{children}</h5>
      if (tag === 'h6') return <h6 id={id}>{children}</h6>
      return <h2 id={id}>{children}</h2>
    },
    blocks: {
      code: ({ node }) => (
        <CodeBlock
          code={node.fields.code}
          language={node.fields.language}
          filename={node.fields.filename}
        />
      ),
      Code: ({ node }: { node: { fields: { code?: string; language?: string; filename?: string } } }) => (
        <CodeBlock
          code={node.fields.code ?? ''}
          language={node.fields.language}
          filename={node.fields.filename}
        />
      ),
      callout: ({ node }) => (
        <CalloutBlock
          variant={node.fields.variant}
          title={node.fields.title}
          content={node.fields.content}
        />
      ),
      mediaBlock: ({ node }) => (
        <MediaBlockView
          media={node.fields.media}
          imageUrl={node.fields.imageUrl}
          caption={node.fields.caption}
          size={node.fields.size}
        />
      ),
    },
  })

  return (
    <div className={className ?? 'article-body'}>
      <RichText data={data} converters={converters} />
    </div>
  )
}
