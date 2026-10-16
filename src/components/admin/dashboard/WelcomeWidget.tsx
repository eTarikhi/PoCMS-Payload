import type { WidgetServerProps } from 'payload'
import { ExternalLinkIcon, FilePlus2Icon, ImageUpIcon } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { adminURL } from './lib'
import { WidgetCard } from './WidgetCard'

/** Greeting with the user's role and the most common actions they are allowed to take. */
export function WelcomeWidget({ req, user, permissions }: WidgetServerProps) {
  const name = (user as { name?: string | null } | null)?.name || user?.email?.split('@')[0] || ''
  const roles = ((user as { roles?: string[] | null } | null)?.roles ?? []).filter(Boolean)
  const canCreate = (slug: 'articles' | 'media') =>
    Boolean(permissions?.collections?.[slug]?.create)
  const siteURL = process.env.NEXT_PUBLIC_SITE_URL || '/'

  return (
    <WidgetCard
      title={name ? `Welcome back, ${name}` : 'Welcome back'}
      description="Manage the content of the eTarikhi portfolio site."
      action={
        roles.length ? (
          <div className="acn:flex acn:gap-1">
            {roles.map((role) => (
              <Badge
                key={role}
                variant={role === 'admin' ? 'default' : 'secondary'}
                className="acn:capitalize"
              >
                {role}
              </Badge>
            ))}
          </div>
        ) : null
      }
    >
      <div className="acn:flex acn:flex-wrap acn:gap-2">
        {canCreate('articles') ? (
          <Button
            nativeButton={false}
            render={<Link href={`${adminURL(req, 'articles')}/create`} />}
          >
            <FilePlus2Icon aria-hidden />
            New article
          </Button>
        ) : null}
        {canCreate('media') ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`${adminURL(req, 'media')}/create`} />}
          >
            <ImageUpIcon aria-hidden />
            Upload media
          </Button>
        ) : null}
        <Button
          variant="ghost"
          nativeButton={false}
          render={<a href={siteURL} target="_blank" rel="noopener noreferrer" />}
        >
          View site
          <ExternalLinkIcon aria-hidden />
          <span className="acn:sr-only">(opens in a new tab)</span>
        </Button>
      </div>
    </WidgetCard>
  )
}

export default WelcomeWidget
