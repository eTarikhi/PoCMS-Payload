import type { ServerProps } from 'payload'

/** Up to two initials from a display name or the local part of an e-mail address. */
export function initialsOf(nameOrEmail: string): string {
  const base = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2)
  return letters.toUpperCase()
}

/**
 * Account avatar in the admin header (`admin.avatar`): the user's initials, styled like the
 * design-system Avatar but as plain server-rendered markup (no client code on every page). Replaces Payload's default Gravatar, which sends a hash of every editor's e-mail address
 * to a third party and shows a broken image offline.
 */
export function AccountAvatar({ user }: ServerProps) {
  const name = (user as { name?: string | null } | undefined)?.name
  const label = name || user?.email || ''
  return (
    <span
      data-testid="account-avatar"
      title={label}
      className="acn:inline-flex acn:size-7 acn:shrink-0 acn:items-center acn:justify-center acn:rounded-full acn:bg-primary acn:text-[11px] acn:font-semibold acn:text-primary-foreground acn:select-none"
    >
      {label ? initialsOf(label) : '?'}
    </span>
  )
}
