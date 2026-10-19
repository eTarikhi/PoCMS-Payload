import { ExternalLinkIcon, PlugZapIcon, TriangleAlertIcon } from 'lucide-react'
import React from 'react'

import type { IntegrationFailure } from '@/integrations/result'

const code = 'acn:rounded-sm acn:bg-muted acn:px-1 acn:py-0.5 acn:text-xs acn:text-foreground'

function ExternalLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="acn:inline-flex acn:items-center acn:gap-1 acn:text-primary acn:underline-offset-4 acn:hover:underline"
    >
      {children}
      <ExternalLinkIcon aria-hidden className="acn:size-3.5 acn:shrink-0" />
      <span className="acn:sr-only"> (opens in a new tab)</span>
    </a>
  )
}

/**
 * What a widget or tool page shows instead of data: the service isn't connected yet (with the
 * environment variables to set, for administrators), it failed (with a link to the fix when the
 * service names one), or the user's roles don't include the tool.
 */
export function IntegrationNotice({
  action,
  docsURL,
  hint,
  isAdmin = false,
  message,
  missing,
  service,
  state,
}: {
  action?: IntegrationFailure['action']
  docsURL?: string
  /** Extra setup guidance for administrators, after the variables to set. */
  hint?: React.ReactNode
  isAdmin?: boolean
  message?: string
  missing?: string[]
  service: string
  state: 'error' | 'forbidden' | 'not-configured'
}) {
  if (state === 'forbidden') {
    return (
      <p className="acn:m-0 acn:text-sm acn:text-muted-foreground">
        Your roles don&apos;t include this tool. An administrator can add it under Admin › Roles.
      </p>
    )
  }
  if (state === 'error') {
    return (
      <div role="status" className="acn:flex acn:items-start acn:gap-2 acn:text-sm">
        <TriangleAlertIcon
          aria-hidden
          className="acn:mt-0.5 acn:size-4 acn:shrink-0 acn:text-destructive"
        />
        <div className="acn:min-w-0 acn:[overflow-wrap:anywhere]">
          <p className="acn:m-0 acn:text-destructive">
            Couldn&apos;t load {service}: {message}
          </p>
          {action ? (
            <p className="acn:relative acn:m-0 acn:mt-1 acn:text-muted-foreground">
              {isAdmin ? (
                <ExternalLink href={action.href}>{action.label}</ExternalLink>
              ) : (
                'An administrator can fix this.'
              )}
            </p>
          ) : null}
        </div>
      </div>
    )
  }
  return (
    <div className="acn:flex acn:items-start acn:gap-2 acn:text-sm acn:text-muted-foreground">
      <PlugZapIcon aria-hidden className="acn:mt-0.5 acn:size-4 acn:shrink-0" />
      <div className="acn:min-w-0">
        <p className="acn:m-0">
          {service} isn&apos;t connected yet.
          {isAdmin ? '' : ' An administrator can connect it.'}
        </p>
        {isAdmin && missing?.length ? (
          <p className="acn:relative acn:m-0 acn:mt-1">
            Set{' '}
            {missing.map((name, i) => (
              <React.Fragment key={name}>
                {i > 0 ? (i === missing.length - 1 ? ' and ' : ', ') : null}
                <code className={code}>{name}</code>
              </React.Fragment>
            ))}{' '}
            in the environment (Vercel › Project › Settings › Environment Variables, or{' '}
            <code className={code}>.env</code> locally), then redeploy.
            {docsURL ? (
              <>
                {' '}
                <ExternalLink href={docsURL}>Setup guide</ExternalLink>
              </>
            ) : null}
          </p>
        ) : null}
        {isAdmin && hint ? <p className="acn:m-0 acn:mt-1">{hint}</p> : null}
      </div>
    </div>
  )
}
