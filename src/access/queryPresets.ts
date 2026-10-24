import type { Access, CollectionSlug, Config, QueryPreset } from 'payload'

import { isAdmin } from '@/access/permissions'
import { customLabel } from '@/i18n/labels'

/**
 * Saved views — Payload's query presets (`/docs/query-presets/overview`).
 *
 * A saved view stores one list view's filters, columns, sort order and grouping as a document in
 * Payload's own `payload-query-presets` collection, so "Unpublished articles", "Failed email this
 * week" or "Media with no alt text" is one click away instead of something each editor rebuilds
 * every morning. Views can be kept private or shared, and the collection itself is hidden from the
 * sidebar: the only UI is the control Payload adds to each list view below.
 *
 * Two levels of access control apply and Payload combines them with an `and`:
 *
 * 1. **Collection level** (`presetAccess`) — who may use saved views at all. Supplying it *replaces*
 *    Payload's default rule rather than adding to it, so every rule below states the obvious part
 *    (a signed-in user) explicitly.
 * 2. **Document level** — the sharing settings on each view: Payload's own "Only me", "Everyone" and
 *    "Specific users", plus `specificRoles` defined here, which fits this project's roles collection
 *    (ADR 0011) better than picking users one by one.
 *
 * Ownership is protected by the document level: a view's constraint defaults to "Only me", and
 * Payload refuses to save a change that would lock its author out of their own view
 * (`preventLockout`), so sharing a view with a role the author does not hold is rejected at save
 * time rather than silently orphaning it.
 *
 * Isomorphic: types only, no `node:` imports, so nothing here can reach a client chunk.
 */

type QueryPresetsConfig = NonNullable<Config['queryPresets']>
type ConstraintList = NonNullable<QueryPresetsConfig['constraints']['read']>
type Constraint = ConstraintList[number]

/** Constraint operations Payload renders sharing settings for (`create` is not one of them). */
const CONSTRAINT_OPERATIONS = ['delete', 'read', 'update'] as const
type ConstraintOperation = (typeof CONSTRAINT_OPERATIONS)[number]

/**
 * Collections whose list view gets saved-view controls.
 *
 * Left out: `about` and `header`, which hold one document each and have no list to filter, and
 * `roles`, which has a handful of rows an administrator edits rarely. Everything an editor or an
 * operator actually pages through is in.
 */
export const PRESET_COLLECTIONS: readonly CollectionSlug[] = [
  'articles',
  'audit-logs',
  'certificates',
  'educations',
  'email-logs',
  'experiences',
  'job-runs',
  'media',
  'pagespeed-reports',
  'projects',
  'services',
  'skills',
  'users',
]

/**
 * Who may use saved views: any signed-in user, for their own views. Collection-level rules are not
 * what stops one editor from deleting another's view — the document-level constraint below the
 * list does that, and it defaults to "Only me".
 */
const signedIn: Access<QueryPreset> = ({ req: { user } }) => Boolean(user)

export const presetAccess: QueryPresetsConfig['access'] = {
  create: signedIn,
  delete: signedIn,
  read: signedIn,
  update: signedIn,
}

/** "Saved view" reads better than "Query Preset" in the sharing dialog and the list controls. */
export const presetLabels: QueryPresetsConfig['labels'] = {
  plural: customLabel('savedViews:plural'),
  singular: customLabel('savedViews:singular'),
}

/**
 * The role IDs a user holds, whatever shape they arrive in: `req.user.roles` carries IDs on a
 * request built from a token and populated documents on one built from a database read, and an
 * access rule that compared an ID to an object would quietly match nothing.
 */
export const roleIdsOf = (user: unknown): (number | string)[] => {
  const roles = (user as { roles?: unknown } | null | undefined)?.roles
  if (!Array.isArray(roles)) return []
  return roles.flatMap((role) => {
    if (typeof role === 'number' || typeof role === 'string') return [role]
    if (role && typeof role === 'object') {
      const id = (role as { id?: unknown }).id
      if (typeof id === 'number' || typeof id === 'string') return [id]
    }
    return []
  })
}

/**
 * "Specific roles": share a view with everyone holding one of the chosen roles. Payload puts these
 * fields inside the `access.<operation>` group, so the stored path — and therefore the query key —
 * is `access.<operation>.roles`.
 *
 * A user with no roles matches nothing, and a signed-out user is refused outright: returning
 * `false` makes Payload add a clause that no document satisfies, which is the safe direction for a
 * rule that failed to resolve.
 */
const specificRoles = (operation: ConstraintOperation): Constraint => ({
  access: ({ req: { user } }) => {
    if (!user) return false
    const ids = roleIdsOf(user)
    if (!ids.length) return false
    return { [`access.${operation}.roles`]: { in: ids } }
  },
  // One field per constraint: Payload indexes them positionally when it builds the group.
  fields: [
    {
      name: 'roles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      required: true,
      admin: {
        description: 'Anyone holding one of these roles can use this saved view.',
      },
    },
  ],
  label: 'Specific Roles',
  value: 'specificRoles',
})

export const presetConstraints: QueryPresetsConfig['constraints'] = Object.fromEntries(
  CONSTRAINT_OPERATIONS.map((operation) => [operation, [specificRoles(operation)]]),
) as QueryPresetsConfig['constraints']

/**
 * Who may offer a view to "Everyone": full access only, the same people who may delete content for
 * good. Everyone else still gets "Only me", "Specific users" and "Specific roles" — enough to share
 * a view with a colleague without publishing it to the whole admin.
 *
 * Payload types this as a select field's `filterOptions` and then uses the return value as the
 * option list, so this returns options rather than a `where` clause (see the query-presets docs).
 */
export const presetConstraintOptions: QueryPresetsConfig['filterConstraints'] = ({ options, req }) =>
  isAdmin(req?.user)
    ? options
    : options.filter((option) => (typeof option === 'string' ? option : option.value) !== 'everyone')
