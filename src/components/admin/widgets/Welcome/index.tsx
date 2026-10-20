import type { WidgetServerProps } from 'payload'
import { ExternalLinkIcon, FilePlus2Icon, ImageUpIcon } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { isAdmin, permissionsOf } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import { buttonVariants } from '@/components/admin/elements/Button'
import { WidgetCard } from '@/components/admin/elements/WidgetCard'
import { adminURL } from '@/components/admin/utilities/collections'

/** Greeting with the user's roles and the most common actions they are allowed to take. */
export function WelcomeWidget({ req, user, permissions }: WidgetServerProps) {
  const name = (user as { name?: string | null } | null)?.name || user?.email?.split('@')[0] || ''
  const roles = permissionsOf(user)?.roles ?? []
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
                variant={isAdmin(user) && roles.length === 1 ? 'default' : 'secondary'}
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
          <Link
            href={`${adminURL(req, 'articles')}/create`}
            data-slot="button"
            className={buttonVariants()}
          >
            <FilePlus2Icon aria-hidden />
            New article
          </Link>
        ) : null}
        {canCreate('media') ? (
          <Link
            href={`${adminURL(req, 'media')}/create`}
            data-slot="button"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ImageUpIcon aria-hidden />
            Upload media
          </Link>
        ) : null}
        <a
          href={siteURL}
          target="_blank"
          rel="noopener noreferrer"
          data-slot="button"
          className={buttonVariants({ variant: 'ghost' })}
        >
          View site
          <ExternalLinkIcon aria-hidden />
          <span className="acn:sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </WidgetCard>
  )
}

export default WelcomeWidget
