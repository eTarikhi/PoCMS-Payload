import { Alert } from '../ui/Alert'

/**
 * Surfaces non-fatal data-layer problems (an unreadable collection, a failed
 * count query, ...) instead of silently rendering zeros.
 */
export type WarningsBannerProps = {
  warnings: string[]
  className?: string
}

export default function WarningsBanner({ warnings, className }: WarningsBannerProps) {
  if (warnings.length === 0) return null

  return (
    <div className={className}>
      <Alert
        variant="warning"
        title={`${warnings.length} data ${warnings.length === 1 ? 'issue' : 'issues'} while building this dashboard`}
        message={
          <ul className="mt-1 list-disc space-y-1 ps-4">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        }
      />
    </div>
  )
}
