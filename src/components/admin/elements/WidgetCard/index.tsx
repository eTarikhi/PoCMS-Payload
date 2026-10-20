import React from 'react'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/admin/elements/Card'

/** Shared frame for dashboard widgets: full-height card, title, optional description and action. */
export function WidgetCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card data-dashboard-widget="" className={`acn:h-full acn:gap-4 ${className ?? ''}`}>
      <CardHeader>
        <CardTitle>
          <h2 className="acn:m-0 acn:text-base acn:leading-snug acn:font-semibold">{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="acn:flex-1">{children}</CardContent>
    </Card>
  )
}
