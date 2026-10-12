import { cn } from '../lib/cn'
import { initials as toInitials } from '../lib/format'

/**
 * Ported from TailAdmin Free `src/components/ui/avatar/Avatar.tsx`.
 *
 * Differences from upstream:
 *  - uses a plain `<img>` instead of `next/image`. Payload media can live on
 *    Vercel Blob (a remote origin), and `next/image` would reject those URLs
 *    unless `images.remotePatterns` is configured. An unoptimised `<img>` keeps
 *    the component drop-in for any media URL.
 *  - falls back to generated initials when there is no image, which is the
 *    common case for CMS users without a gravatar.
 */
export type AvatarSize = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge'
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'none'

export type AvatarProps = {
  src?: string | null
  alt?: string
  /** Used for the initials fallback when `src` is missing. */
  name?: string | null
  size?: AvatarSize
  status?: AvatarStatus
  className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
  xsmall: 'h-6 w-6 max-w-6 text-theme-xs',
  small: 'h-8 w-8 max-w-8 text-theme-xs',
  medium: 'h-10 w-10 max-w-10 text-theme-sm',
  large: 'h-12 w-12 max-w-12 text-theme-sm',
  xlarge: 'h-14 w-14 max-w-14 text-sm',
  xxlarge: 'h-16 w-16 max-w-16 text-base',
}

const statusSizeClasses: Record<AvatarSize, string> = {
  xsmall: 'h-1.5 w-1.5 max-w-1.5',
  small: 'h-2 w-2 max-w-2',
  medium: 'h-2.5 w-2.5 max-w-2.5',
  large: 'h-3 w-3 max-w-3',
  xlarge: 'h-3.5 w-3.5 max-w-3.5',
  xxlarge: 'h-4 w-4 max-w-4',
}

const statusColorClasses: Record<Exclude<AvatarStatus, 'none'>, string> = {
  online: 'bg-success-500',
  offline: 'bg-error-400',
  busy: 'bg-warning-500',
}

export function Avatar({
  src,
  alt = 'Avatar',
  name,
  size = 'medium',
  status = 'none',
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- see component docs
        <img src={src} alt={alt} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span aria-hidden="true">{toInitials(name ?? alt)}</span>
      )}

      {status !== 'none' && (
        <span
          className={cn(
            'absolute right-0 bottom-0 rounded-full border-[1.5px] border-white dark:border-gray-900',
            statusSizeClasses[size],
            statusColorClasses[status],
          )}
        />
      )}
    </div>
  )
}

export default Avatar
