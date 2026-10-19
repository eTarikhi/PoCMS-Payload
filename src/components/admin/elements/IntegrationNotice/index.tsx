import { PlugZapIcon, TriangleAlertIcon } from 'lucide-react'
import React from 'react'

/**
 * What a widget or tool page shows instead of data: the service isn't connected yet (with the
 * environment variables to set, for administrators), it failed, or the user's roles don't include
 * the tool.
 */
export function IntegrationNotice({
  docsURL,
  isAdmin = false,
  message,
  missing,
  service,
  state,
}: {
  docsURL?: string
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
      <p
        role="status"
        className="acn:m-0 acn:flex acn:items-start acn:gap-2 acn:text-sm acn:text-destructive"
      >
        <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-4 acn:shrink-0" />
        <span>
          Couldn&apos;t load {service}: {message}
        </span>
      </p>
    )
  }
  return (
    <div className="acn:flex acn:items-start acn:gap-2 acn:text-sm acn:text-muted-foreground">
      <PlugZapIcon aria-hidden className="acn:mt-0.5 acn:size-4 acn:shrink-0" />
      <div>
        <p className="acn:m-0">
          {service} isn&apos;t connected yet.
          {isAdmin ? '' : ' An administrator can connect it.'}
        </p>
        {isAdmin && missing?.length ? (
          <p className="acn:m-0 acn:mt-1">
            Set{' '}
            {missing.map((name, i) => (
              <React.Fragment key={name}>
                {i > 0 ? (i === missing.length - 1 ? ' and ' : ', ') : null}
                <code className="acn:rounded-sm acn:bg-muted acn:px-1 acn:py-0.5 acn:text-xs acn:text-foreground">
                  {name}
                </code>
              </React.Fragment>
            ))}{' '}
            in the environment (Vercel › Project › Settings › Environment Variables, or{' '}
            <code className="acn:rounded-sm acn:bg-muted acn:px-1 acn:py-0.5 acn:text-xs acn:text-foreground">
              .env
            </code>{' '}
            locally), then redeploy.
            {docsURL ? (
              <>
                {' '}
                <a
                  href={docsURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="acn:text-primary acn:underline-offset-4 acn:hover:underline"
                >
                  Setup guide<span className="acn:sr-only"> (opens in a new tab)</span>
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  )
}
