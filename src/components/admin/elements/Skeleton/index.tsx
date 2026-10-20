import { cn } from '@/components/admin/utilities/cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('acn:animate-pulse acn:rounded-md acn:bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
