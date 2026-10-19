import type { BeforeListTableServerProps } from 'payload'
import React from 'react'

import {
  ACCESS_LEVEL_HELP,
  ACCESS_LEVEL_LABELS,
  type AccessLevel,
  CAPABILITIES,
  type GovernedEntity,
  governedEntities,
  isAdmin,
  mergeRoles,
  type RoleLike,
} from '@/access/permissions'
import { cn } from '@/components/admin/utilities/cn'

const LEVEL_STYLE: Record<AccessLevel, string> = {
  none: 'acn:text-muted-foreground',
  read: 'acn:bg-secondary acn:text-secondary-foreground',
  edit: 'acn:bg-success-soft acn:text-success',
  full: 'acn:bg-warning-soft acn:text-warning',
}

function Level({ level }: { level: AccessLevel }) {
  if (level === 'none') {
    return (
      <span className={LEVEL_STYLE.none} title={ACCESS_LEVEL_HELP.none}>
        <span aria-hidden="true">—</span>
        <span className="acn:sr-only">{ACCESS_LEVEL_LABELS.none}</span>
      </span>
    )
  }
  return (
    <span
      title={ACCESS_LEVEL_HELP[level]}
      className={cn(
        'acn:inline-flex acn:rounded-sm acn:px-1.5 acn:py-0.5 acn:text-xs acn:font-medium',
        LEVEL_STYLE[level],
      )}
    >
      {ACCESS_LEVEL_LABELS[level]}
    </span>
  )
}

function Allowed() {
  return (
    <span className="acn:inline-flex acn:rounded-sm acn:bg-success-soft acn:px-1.5 acn:py-0.5 acn:text-xs acn:font-medium acn:text-success">
      Allowed
    </span>
  )
}

const cell = 'acn:border-b acn:border-border acn:px-3 acn:py-2 acn:text-left acn:align-middle'

/**
 * `beforeListTable` of the roles collection: what every role grants, side by side (rows are the
 * governed collections, globals and tools; columns are the roles). Server rendered from the role
 * documents with the same merge the access checks use, so it shows exactly what applies.
 */
export async function AccessOverview({ payload, user }: BeforeListTableServerProps) {
  if (!isAdmin(user)) return null
  const { docs: roles } = await payload.find({
    collection: 'roles',
    depth: 0,
    joins: false,
    limit: 50,
    sort: 'name',
    overrideAccess: false,
    user,
  })
  if (roles.length === 0) return null

  const entities = governedEntities(payload.config)
  const groups = new Map<string, GovernedEntity[]>()
  for (const entity of entities)
    groups.set(entity.group, [...(groups.get(entity.group) ?? []), entity])

  const columns = await Promise.all(
    roles.map(async (role) => ({
      role,
      merged: mergeRoles([role as RoleLike], entities),
      members: (
        await payload.count({
          collection: 'users',
          where: { roles: { in: [role.id] } },
          overrideAccess: false,
          user,
        })
      ).totalDocs,
    })),
  )
  const rolesURL = `${payload.config.routes.admin}/collections/roles`

  return (
    <section
      aria-labelledby="access-overview-title"
      className="acn:mb-6 acn:overflow-hidden acn:rounded-lg acn:border acn:border-border acn:bg-card"
    >
      <div className="acn:px-4 acn:pt-4 acn:pb-3">
        <h2 id="access-overview-title" className="acn:m-0 acn:text-base acn:font-semibold">
          Access overview
        </h2>
        <p className="acn:m-0 acn:mt-1 acn:text-sm acn:text-muted-foreground">
          What each role allows. A user with several roles gets the highest level of each.
        </p>
      </div>
      <div className="acn:overflow-x-auto">
        <table className="acn:w-full acn:border-collapse acn:text-sm">
          <caption className="acn:sr-only">Access level per collection, global and tool</caption>
          <thead>
            <tr className="acn:bg-muted/50">
              <th scope="col" className={cn(cell, 'acn:font-medium acn:text-muted-foreground')}>
                Collection or tool
              </th>
              {columns.map(({ role, members }) => (
                <th key={role.id} scope="col" className={cn(cell, 'acn:font-medium')}>
                  <a
                    href={`${rolesURL}/${role.id}`}
                    className="acn:text-foreground acn:underline-offset-4 acn:hover:underline"
                  >
                    {role.name}
                  </a>
                  <span className="acn:block acn:text-xs acn:font-normal acn:text-muted-foreground">
                    {members} {members === 1 ? 'user' : 'users'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...groups].map(([group, items]) => (
              <React.Fragment key={group}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={columns.length + 1}
                    className={cn(
                      cell,
                      'acn:pt-3 acn:text-xs acn:font-semibold acn:tracking-wide acn:text-muted-foreground acn:uppercase',
                    )}
                  >
                    {group}
                  </th>
                </tr>
                {items.map((entity) => (
                  <tr key={entity.slug}>
                    <th scope="row" className={cn(cell, 'acn:font-normal')}>
                      {entity.label}
                    </th>
                    {columns.map(({ role, merged }) => (
                      <td key={role.id} className={cell}>
                        <Level level={merged.levels[entity.slug] ?? 'none'} />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
            <tr>
              <th
                scope="colgroup"
                colSpan={columns.length + 1}
                className={cn(
                  cell,
                  'acn:pt-3 acn:text-xs acn:font-semibold acn:tracking-wide acn:text-muted-foreground acn:uppercase',
                )}
              >
                Tools
              </th>
            </tr>
            {CAPABILITIES.map((capability) => (
              <tr key={capability.name}>
                <th
                  scope="row"
                  className={cn(cell, 'acn:font-normal')}
                  title={capability.description}
                >
                  {capability.label}
                </th>
                {columns.map(({ role, merged }) =>
                  merged.capabilities.includes(capability.name) ? (
                    <td key={role.id} className={cell}>
                      <Allowed />
                    </td>
                  ) : (
                    <td key={role.id} className={cell}>
                      <Level level="none" />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
