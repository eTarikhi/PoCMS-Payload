'use client'

import { useAuth, useConfig } from '@payloadcms/ui'
import { LogOutIcon, UserRoundCogIcon } from 'lucide-react'
import React, { useRef } from 'react'

import { permissionsOf } from '@/access/permissions'
import { initialsOf } from '@/components/admin/graphics/AccountAvatar'
import { useDismissable } from '@/components/admin/hooks/useDismissable'

const item =
  'acn:flex acn:items-center acn:gap-2 acn:rounded-sm acn:px-2 acn:py-1.5 acn:pointer-coarse:min-h-10 acn:text-sm acn:text-popover-foreground acn:no-underline acn:outline-none acn:hover:bg-accent acn:focus-visible:bg-accent acn:focus-visible:ring-2 acn:focus-visible:ring-ring/50 acn:[&_svg]:size-4 acn:[&_svg]:text-muted-foreground'

/**
 * Header account menu (replaces Payload's avatar link, which nav-rail.css hides): who is signed
 * in, account settings and log out. Log out moved here from the bottom of the sidebar.
 */
export function AccountMenu() {
  const { user } = useAuth()
  const { config } = useConfig()
  const ref = useRef<HTMLDetailsElement>(null)
  useDismissable(ref)
  if (!user) return null
  const name = (user as { name?: string | null }).name || user.email || 'Account'
  const roles = (permissionsOf(user)?.roles ?? []).join(', ')
  const admin = config.routes.admin

  return (
    <details ref={ref} className="acn:relative" data-testid="account-menu">
      <summary
        title={name}
        className="acn:flex acn:size-8 acn:cursor-pointer acn:list-none acn:items-center acn:justify-center acn:rounded-full acn:bg-primary acn:text-xs acn:font-semibold acn:text-primary-foreground acn:outline-none acn:focus-visible:ring-3 acn:focus-visible:ring-ring/50 acn:[&::-webkit-details-marker]:hidden"
      >
        <span className="acn:sr-only">Account menu for {name}. </span>
        {initialsOf(name)}
      </summary>
      <nav
        aria-label="Account"
        className="acn:absolute acn:top-full acn:right-0 acn:z-50 acn:mt-2 acn:w-60 acn:rounded-md acn:bg-popover acn:p-1 acn:text-popover-foreground acn:shadow-md acn:ring-1 acn:ring-foreground/10 acn:[details:not([open])>&]:hidden"
      >
        <div className="acn:border-b acn:border-border acn:px-2 acn:pt-1 acn:pb-2">
          <p className="acn:m-0 acn:truncate acn:text-sm acn:font-medium">{name}</p>
          {name !== user.email ? (
            <p className="acn:m-0 acn:truncate acn:text-xs acn:text-muted-foreground">
              {user.email}
            </p>
          ) : null}
          {roles ? <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">{roles}</p> : null}
        </div>
        <ul className="acn:m-0 acn:mt-1 acn:list-none acn:p-0">
          <li>
            <a href={`${admin}/account`} data-slot="button" className={item}>
              <UserRoundCogIcon aria-hidden />
              Account settings
            </a>
          </li>
          <li>
            <a href={`${admin}/logout`} data-slot="button" className={item}>
              <LogOutIcon aria-hidden />
              Log out
            </a>
          </li>
        </ul>
      </nav>
    </details>
  )
}

export default AccountMenu
