import React from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'

import type { RegistryCategory, RegistryEntry } from './registry'
import { ComponentPath } from './Section'

const CATEGORIES: {
  id: RegistryCategory
  title: string
  configKey: string
  docs: string
}[] = [
  {
    id: 'root',
    title: 'Root components',
    configKey: 'admin.components, admin.avatar',
    docs: 'https://payloadcms.com/docs/custom-components/root-components',
  },
  {
    id: 'widgets',
    title: 'Dashboard widgets',
    configKey: 'admin.dashboard.widgets',
    docs: 'https://payloadcms.com/docs/custom-components/dashboard',
  },
  {
    id: 'collections',
    title: 'Collection components',
    configKey: 'collection.admin.components',
    docs: 'https://payloadcms.com/docs/custom-components/list-view',
  },
  {
    id: 'fields',
    title: 'Field components',
    configKey: 'field.admin.components',
    docs: 'https://payloadcms.com/docs/fields/overview#custom-components',
  },
]

/** Where Payload renders a slot, in words. */
function whereOf(entry: RegistryEntry): string {
  if (entry.category === 'widgets') return 'Dashboard (editors add, resize and remove it)'
  const known: Record<string, string> = {
    actions: 'Header',
    afterNavLinks: 'Sidebar, below the links',
    'avatar.Component': 'Header account button',
    beforeListTable: 'Above the list table',
    beforeNavLinks: 'Sidebar, above the links',
    Cell: 'List table cell',
    Field: 'Edit view input',
    'graphics.Icon': 'Sidebar and breadcrumbs',
    'graphics.Logo': 'Login screen',
    'logout.Button': 'Sidebar footer (renders nothing: log out is in the account menu)',
    providers: 'Wraps every admin page (loads the admin stylesheet)',
    'views.list.Component': 'Collection list view',
  }
  if (known[entry.slot]) return known[entry.slot]
  const view = entry.slot.match(/^views\.([^.]+)\.Component$/)
  if (view) return `Custom admin view (${view[1]})`
  return '-'
}

function UsedBy({ owners }: { owners: string[] }) {
  if (owners.length === 0) return <span className="acn:text-muted-foreground">-</span>
  const shown = owners.slice(0, 3)
  const rest = owners.length - shown.length
  return (
    <span title={owners.join('\n')}>
      {shown.join(', ')}
      {rest > 0 ? <span className="acn:text-muted-foreground"> +{rest} more</span> : null}
    </span>
  )
}

/** The registry, one table per Payload docs category. */
export function RegistryTables({ entries }: { entries: RegistryEntry[] }) {
  return (
    <div className="acn:space-y-6">
      {CATEGORIES.map((category) => {
        const rows = entries.filter((entry) => entry.category === category.id)
        if (rows.length === 0) return null
        const withOwners = category.id === 'collections' || category.id === 'fields'
        return (
          <div key={category.id} data-registry={category.id} className="acn:space-y-2">
            <h3 className="acn:m-0 acn:flex acn:flex-wrap acn:items-baseline acn:gap-x-2 acn:text-base acn:font-semibold">
              {category.title}
              <code className="acn:font-mono acn:text-xs acn:font-normal acn:text-muted-foreground">
                {category.configKey}
              </code>
              <Badge variant="outline" className="acn:tabular-nums">
                {rows.length}
              </Badge>
              <a
                href={category.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="acn:text-xs acn:font-normal acn:text-muted-foreground acn:underline-offset-2 acn:hover:underline"
              >
                Payload docs
                <span className="acn:sr-only"> for {category.title} (opens in a new tab)</span>
              </a>
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="acn:w-48">Slot</TableHead>
                  <TableHead>Component path</TableHead>
                  <TableHead>Where it shows</TableHead>
                  {withOwners ? <TableHead>Used by</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={`${entry.slot}|${entry.path}`}>
                    <TableCell>
                      <code className="acn:font-mono acn:text-xs">{entry.slot}</code>
                    </TableCell>
                    <TableCell className="acn:whitespace-normal">
                      <ComponentPath path={entry.path} className="acn:text-xs" />
                    </TableCell>
                    <TableCell className="acn:whitespace-normal acn:text-muted-foreground">
                      {whereOf(entry)}
                    </TableCell>
                    {withOwners ? (
                      <TableCell className="acn:whitespace-normal">
                        <UsedBy owners={entry.usedBy} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      })}
    </div>
  )
}
