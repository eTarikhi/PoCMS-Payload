import type { Article } from '@/payload-types'
import { hasLexicalContent } from '@/app/(frontend)/lib/lexical'
import { RichTextContent } from '../richtext/RichTextContent'

type ArticleBodyProps = {
  content?: Article['content']
  paragraphs?: string[]
}

export function ArticleBody({ content, paragraphs = [] }: ArticleBodyProps) {
  if (content && hasLexicalContent(content)) {
    return <RichTextContent data={content} className="article-body" />
  }

  const visible = paragraphs.filter((paragraph) => paragraph.trim().length > 0)

  return (
    <div className="article-body">
      {visible.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}
