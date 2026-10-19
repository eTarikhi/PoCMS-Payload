import { ExternalLinkIcon } from 'lucide-react'
import React from 'react'

import { cn } from '@/components/admin/utilities/cn'

/** One gallery section: heading, what the components are for, and the Payload docs page for them. */
export function GallerySection({
  id,
  title,
  description,
  docs,
  children,
}: {
  id: string
  title: string
  description: React.ReactNode
  docs?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      data-slot="gallery-section"
      aria-labelledby={`${id}-title`}
      className="acn:scroll-mt-24 acn:space-y-4"
    >
      <div className="acn:space-y-1">
        <h2
          id={`${id}-title`}
          className="acn:m-0 acn:text-xl acn:font-semibold acn:text-foreground"
        >
          {title}
        </h2>
        <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
          {description}
          {docs ? (
            <>
              {' '}
              <a
                href={docs.href}
                target="_blank"
                rel="noopener noreferrer"
                className="acn:inline-flex acn:items-center acn:gap-1 acn:text-foreground acn:underline-offset-2 acn:hover:underline"
              >
                {docs.label}
                <ExternalLinkIcon aria-hidden className="acn:size-3" />
                <span className="acn:sr-only"> (opens in a new tab)</span>
              </a>
            </>
          ) : null}
        </p>
      </div>
      {children}
    </section>
  )
}

/** A Component Path that wraps after a slash or `#` rather than in the middle of a name. */
export function ComponentPath({ path, className }: { path: string; className?: string }) {
  const parts = path.split(/(?<=[/#])/)
  return (
    <code className={cn('acn:font-mono', className)}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {part}
        </React.Fragment>
      ))}
    </code>
  )
}

/** A live component with a caption: its name, its Component Path and where Payload renders it. */
export function Specimen({
  title,
  path,
  meta,
  className,
  children,
}: {
  title: string
  path?: string
  meta?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <figure
      data-slot="gallery-specimen"
      className={cn(
        'acn:m-0 acn:flex acn:min-w-0 acn:flex-col acn:gap-3 acn:rounded-xl acn:border acn:border-dashed acn:border-border acn:p-3',
        className,
      )}
    >
      <div className="acn:min-w-0 acn:flex-1">{children}</div>
      <figcaption className="acn:space-y-0.5 acn:text-xs acn:text-muted-foreground">
        <span className="acn:block acn:text-sm acn:font-medium acn:text-foreground">{title}</span>
        {path ? <ComponentPath path={path} className="acn:block" /> : null}
        {meta ? <span className="acn:block">{meta}</span> : null}
      </figcaption>
    </figure>
  )
}
