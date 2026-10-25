import type { ReactNode } from 'react'

type RichNode = { type?: string; text?: string; children?: RichNode[]; version?: number; tag?: string; fields?: Record<string, unknown> }
export type RichTextValue = { root?: RichNode } | null | undefined

const renderNodes = (nodes: RichNode[], path = 'node'): ReactNode[] => nodes.map((node, index) => {
  const key = `${path}-${index}`
  if (node.type === 'text') return <span key={key}>{node.text}</span>
  const children = renderNodes(node.children ?? [], key)
  if (node.type === 'paragraph') return <p key={key}>{children}</p>
  if (node.type === 'heading') return <>{node.tag === 'h2' ? <h2 key={key}>{children}</h2> : <h3 key={key}>{children}</h3>}</>
  if (node.type === 'quote') return <blockquote key={key}>{children}</blockquote>
  if (node.type === 'list') return <ul key={key}>{children}</ul>
  if (node.type === 'listitem') return <li key={key}>{children}</li>
  if (node.type === 'link') return <a key={key} href={typeof node.fields?.url === 'string' ? node.fields.url : '#'}>{children}</a>
  return <div key={key}>{children}</div>
})

export function RichText({ value }: { value: RichTextValue }) {
  return <div className="article-body">{renderNodes(value?.root?.children ?? [])}</div>
}
