import { PlusIcon } from '../icons'
import { Button } from '../ui/Button'
import { ComponentCard } from '../ui/Card'

/**
 * Create-shortcuts panel. Each action deep-links into Payload's own edit view
 * (`/admin/collections/:slug/create`), so the TailAdmin surface stays a thin
 * presentation layer on top of Payload's battle-tested CRUD forms.
 */
export type QuickAction = {
  label: string
  href: string
}

export type QuickActionsProps = {
  actions: QuickAction[]
  className?: string
}

export default function QuickActions({ actions, className }: QuickActionsProps) {
  return (
    <ComponentCard
      title="Quick actions"
      desc="Jump straight into the most-used create flows."
      className={className}
    >
      <div className="flex flex-wrap gap-3">
        {actions.length === 0 ? (
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            No create permissions on the current collections.
          </p>
        ) : null}
        {actions.map((action) => (
          <Button key={action.href} href={action.href} variant="outline" startIcon={<PlusIcon size={16} />}>
            {action.label}
          </Button>
        ))}
      </div>
    </ComponentCard>
  )
}
