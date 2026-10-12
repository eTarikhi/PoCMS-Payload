'use client'

import { useState } from 'react'

import {
  Avatar,
  Badge,
  Button,
  ComponentCard,
  Dropdown,
  DropdownItem,
  Panel,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '../ui'
import { Alert } from '../ui/Alert'
import { ChevronDownIcon, HorizontaLDots, PlusIcon, SearchIcon } from '../icons'

/**
 * Component gallery for `/admin/tailadmin/ui-kit`.
 *
 * Its job is to prove, visually and in one place, that the vendored TailAdmin
 * Free design system renders correctly *inside the Payload admin panel* — in
 * both light and dark mode, at every breakpoint — before any of it is used for
 * a real CMS surface. It doubles as the living styleguide for the roadmap's
 * later phases.
 */
const buttonVariants = ['primary', 'outline', 'ghost', 'danger'] as const
const badgeColors = ['primary', 'success', 'error', 'warning', 'info', 'light', 'dark'] as const

export default function UiKitGallery() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Buttons ---------------------------------------------------------- */}
      <ComponentCard title="Buttons" desc="TailAdmin Button — four variants, three sizes.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {buttonVariants.map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
            <Button variant="primary" disabled>
              disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" startIcon={<PlusIcon size={16} />}>
              Small
            </Button>
            <Button size="md" variant="outline" startIcon={<SearchIcon size={16} />}>
              Medium
            </Button>
            <Button size="lg" variant="outline">
              Large
            </Button>
          </div>
        </div>
      </ComponentCard>

      {/* Badges + avatars -------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
        <ComponentCard title="Badges" desc="Status colours map onto Payload document states.">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {badgeColors.map((color) => (
                <Badge key={color} color={color}>
                  {color}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {badgeColors.slice(0, 4).map((color) => (
                <Badge key={color} color={color} variant="solid" size="sm">
                  solid {color}
                </Badge>
              ))}
            </div>
          </div>
        </ComponentCard>

        <ComponentCard title="Avatars" desc="Falls back to generated initials when there is no image.">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar size="xsmall" name="Vahid Tarikhi" />
            <Avatar size="small" name="Vahid Tarikhi" />
            <Avatar size="medium" name="Vahid Tarikhi" status="online" />
            <Avatar size="large" name="Editor Person" status="busy" />
            <Avatar size="xlarge" name="Admin" status="offline" />
          </div>
        </ComponentCard>
      </div>

      {/* Alerts ------------------------------------------------------------ */}
      <ComponentCard title="Alerts" desc="Used by the dashboard to surface non-fatal data problems.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Alert variant="success" title="Changes saved" message="Document published successfully." />
          <Alert variant="info" title="Pilot active" message="TailAdmin Free surfaces are enabled." />
          <Alert variant="warning" title="2 collections unavailable" message="Counts could not be read." />
          <Alert variant="error" title="Query failed" message="The database rejected the request." />
        </div>
      </ComponentCard>

      {/* Dropdown + inputs -------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
        <ComponentCard title="Dropdown" desc="Click-outside and Escape close it (upstream behaviour).">
          <div className="relative inline-block">
            <Button
              variant="outline"
              onClick={() => setDropdownOpen((prev) => !prev)}
              endIcon={<ChevronDownIcon size={16} />}
            >
              Open menu
            </Button>
            <Dropdown isOpen={dropdownOpen} onClose={() => setDropdownOpen(false)} className="w-52">
              <DropdownItem icon={<PlusIcon size={16} />} onItemClick={() => setDropdownOpen(false)}>
                New document
              </DropdownItem>
              <DropdownItem icon={<HorizontaLDots size={16} />} onItemClick={() => setDropdownOpen(false)}>
                Duplicate
              </DropdownItem>
              <DropdownItem href="/admin" icon={<SearchIcon size={16} />}>
                Payload dashboard
              </DropdownItem>
            </Dropdown>
          </div>
        </ComponentCard>

        <ComponentCard title="Panels & type scale" desc="TailAdmin type tokens (theme-xs → title-sm).">
          <div className="flex flex-col gap-3">
            <Panel padded className="bg-gray-25 dark:bg-white/3">
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">text-theme-xs</p>
              <p className="text-theme-sm text-gray-700 dark:text-gray-300">text-theme-sm</p>
              <p className="text-theme-xl font-medium text-gray-800 dark:text-white/90">text-theme-xl</p>
              <p className="text-title-sm font-bold text-gray-900 dark:text-white">text-title-sm</p>
            </Panel>
          </div>
        </ComponentCard>
      </div>

      {/* Table -------------------------------------------------------------- */}
      <ComponentCard title="Table" desc="The same primitives the content tables are built from.">
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Document
                </TableCell>
                <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Collection
                </TableCell>
                <TableCell isHeader className="py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Status
                </TableCell>
                <TableCell isHeader className="py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Updated
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
              {[
                { id: '1', title: 'Rebranding case study', collection: 'Projects', status: 'published', updated: '2 hours ago' },
                { id: '2', title: 'Payload 3 migration notes', collection: 'Articles', status: 'draft', updated: 'yesterday' },
                { id: '3', title: 'Design systems offering', collection: 'Services', status: 'published', updated: '3 days ago' },
              ].map((row) => (
                <TableRow
                  key={row.id}
                  className={selectedRow === row.id ? 'bg-brand-50/60 dark:bg-brand-500/10' : undefined}
                >
                  <TableCell className="py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedRow(selectedRow === row.id ? null : row.id)}
                      className="text-theme-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                    >
                      {row.title}
                    </button>
                  </TableCell>
                  <TableCell className="py-3 text-theme-sm text-gray-500 dark:text-gray-400">{row.collection}</TableCell>
                  <TableCell className="py-3">
                    <Badge size="sm" color={row.status === 'published' ? 'success' : 'warning'}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-end text-theme-sm text-gray-500 dark:text-gray-400">
                    {row.updated}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-theme-xs text-gray-400 dark:text-gray-500">
          Click a row title to see the selected state — interactive primitives work inside the Payload
          admin panel because they are ordinary client components in the import map.
        </p>
      </ComponentCard>
    </div>
  )
}
