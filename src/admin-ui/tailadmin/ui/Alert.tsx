import type { ReactNode } from 'react'

import { cn } from '../lib/cn'
import { CheckCircleIcon, CloseIcon, InfoIcon } from '../icons'

/**
 * Ported from TailAdmin Free `src/components/ui/alert/Alert.tsx`.
 *
 * The inline SVGs upstream are replaced with the Lucide-backed icon set from
 * `../icons`, and `showLink` renders a plain anchor (no next-intl here).
 */
export type AlertVariant = 'success' | 'error' | 'warning' | 'info'

export type AlertProps = {
  variant: AlertVariant
  title: string
  message?: ReactNode
  showLink?: boolean
  linkHref?: string
  linkText?: string
  onClose?: () => void
  className?: string
}

const variantClasses: Record<AlertVariant, { container: string; icon: string }> = {
  success: {
    container: 'border-success-500 bg-success-50 dark:border-success-500/30 dark:bg-success-500/15',
    icon: 'text-success-500',
  },
  error: {
    container: 'border-error-500 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15',
    icon: 'text-error-500',
  },
  warning: {
    container: 'border-warning-500 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15',
    icon: 'text-warning-500',
  },
  info: {
    container:
      'border-blue-light-500 bg-blue-light-50 dark:border-blue-light-500/30 dark:bg-blue-light-500/15',
    icon: 'text-blue-light-500',
  },
}

function AlertIcon({ variant, className }: { variant: AlertVariant; className?: string }) {
  if (variant === 'success') return <CheckCircleIcon className={className} size={24} />
  if (variant === 'error') return <CloseIcon className={className} size={24} />
  return <InfoIcon className={className} size={24} />
}

export function Alert({
  variant,
  title,
  message,
  showLink = false,
  linkHref = '#',
  linkText = 'Learn more',
  onClose,
  className,
}: AlertProps) {
  const styles = variantClasses[variant]

  return (
    <div className={cn('relative flex w-full gap-3 rounded-xl border p-4', styles.container, className)}>
      <span className={cn('mt-0.5 shrink-0', styles.icon)}>
        <AlertIcon variant={variant} className={styles.icon} />
      </span>

      <div className="flex-1">
        <h4 className="mb-1 text-theme-sm font-semibold text-gray-800 dark:text-white/90">{title}</h4>
        {message ? (
          <div className="text-theme-sm text-gray-700 dark:text-gray-300">{message}</div>
        ) : null}
        {showLink ? (
          <a
            href={linkHref}
            className={cn('inline-block mt-2 text-theme-sm font-medium hover:underline', styles.icon)}
          >
            {linkText}
          </a>
        ) : null}
      </div>

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
        >
          <CloseIcon size={18} />
        </button>
      ) : null}
    </div>
  )
}

export default Alert
