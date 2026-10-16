'use client'

import type { DefaultCellComponentProps } from 'payload'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'

import { SERVICE_ICONS } from '../../fields/serviceIcons'

/** Services icon in lists: the icon plus its stored name. */
export function IconCellView({ cellData }: DefaultCellComponentProps) {
  const value = typeof cellData === 'string' ? cellData : ''
  if (!value) return <span className="acn:text-muted-foreground">-</span>
  const icon = SERVICE_ICONS[value]
  return (
    <span className="acn:inline-flex acn:items-center acn:gap-2">
      {icon ? <FontAwesomeIcon icon={icon} className="acn:size-4" aria-hidden /> : null}
      <span>{value}</span>
    </span>
  )
}

export default IconCellView
