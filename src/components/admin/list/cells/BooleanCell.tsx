'use client'

import type { DefaultCellComponentProps } from 'payload'
import { CheckIcon } from 'lucide-react'
import React from 'react'

import { Badge } from '../../ui/badge'

/**
 * Checkbox fields in lists. Payload's default cell prints `t('general:' + value)`, which shows the raw
 * key "general:null" for documents saved before the field existed; unset means unchecked here.
 */
export function BooleanCell({ cellData }: DefaultCellComponentProps) {
  if (cellData === true) {
    return (
      <Badge variant="secondary">
        <CheckIcon aria-hidden />
        Yes
      </Badge>
    )
  }
  return <span className="acn:text-muted-foreground">No</span>
}

export default BooleanCell
