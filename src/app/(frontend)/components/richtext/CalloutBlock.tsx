export type CalloutVariant = 'info' | 'tip' | 'warning' | 'danger'

const VARIANT_LABELS: Record<CalloutVariant, string> = {
  info: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  danger: 'Caution',
}

export type CalloutBlockProps = {
  variant?: string | null
  title?: string | null
  content: string
}

export function CalloutBlock({ variant, title, content }: CalloutBlockProps) {
  const normalizedVariant: CalloutVariant =
    variant === 'tip' || variant === 'warning' || variant === 'danger' ? variant : 'info'
  const heading = title?.trim() || VARIANT_LABELS[normalizedVariant]
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return (
    <aside
      role="note"
      aria-label={heading}
      className={`rich-callout rich-callout-${normalizedVariant}`}
      data-variant={normalizedVariant}
    >
      <p className="rich-callout-title">{heading}</p>
      <div className="rich-callout-body">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </aside>
  )
}
