import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

/**
 * Ported from TailAdmin Free `src/components/ui/button/Button.tsx`.
 *
 * Differences from upstream:
 *  - renders as a Next.js `<Link>` when `href` is supplied (TailAdmin only had
 *    a `<button>`), which is what an admin panel actually needs;
 *  - class composition goes through `cn()` instead of string interpolation;
 *  - added `ghost` and `danger` variants used by the CMS surfaces.
 */
export type ButtonSize = 'sm' | 'md' | 'lg'
export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger'

export type ButtonProps = {
  children: ReactNode
  size?: ButtonSize
  variant?: ButtonVariant
  startIcon?: ReactNode
  endIcon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  href?: string
  target?: string
  rel?: string
  type?: 'button' | 'submit' | 'reset'
  'aria-label'?: string
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-theme-xs',
  md: 'px-4 py-2.5 text-theme-sm',
  lg: 'px-5 py-3.5 text-sm',
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300 focus-visible:ring-3 focus-visible:ring-brand-500/25',
  outline:
    'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-gray-800 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/3 dark:hover:text-gray-200',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
  danger:
    'bg-error-500 text-white shadow-theme-xs hover:bg-error-600 disabled:bg-error-300 focus-visible:ring-3 focus-visible:ring-error-500/25',
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-200 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-60'

export function Button({
  children,
  size = 'md',
  variant = 'primary',
  startIcon,
  endIcon,
  onClick,
  className,
  disabled = false,
  href,
  target,
  rel,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = cn(baseClasses, sizeClasses[size], variantClasses[variant], className)
  const content = (
    <>
      {startIcon ? <span className="flex items-center">{startIcon}</span> : null}
      {children}
      {endIcon ? <span className="flex items-center">{endIcon}</span> : null}
    </>
  )

  if (href && !disabled) {
    const isExternal = href.startsWith('http')
    if (isExternal) {
      return (
        <a
          className={classes}
          href={href}
          target={target ?? '_blank'}
          rel={rel ?? 'noopener noreferrer'}
          {...rest}
        >
          {content}
        </a>
      )
    }
    return (
      <Link className={classes} href={href} target={target} onClick={onClick}>
        {content}
      </Link>
    )
  }

  return (
    <button className={classes} onClick={onClick} disabled={disabled} type={type} {...rest}>
      {content}
    </button>
  )
}

export default Button
