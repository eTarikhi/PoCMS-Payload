'use client'

import type { SelectFieldClientComponent } from 'payload'
import React from 'react'

import { OptionTiles } from '@/components/admin/elements/OptionTiles'

import { BOOTSTRAP_CONTEXT_COLORS } from './colors'

/** Skills color: Bootstrap contextual colors as swatches (stored value unchanged). */
export const ContextColorField: SelectFieldClientComponent = (props) => (
  <OptionTiles
    {...props}
    renderVisual={(value) => (
      <span
        aria-hidden
        className="acn:size-4 acn:shrink-0 acn:rounded-full acn:ring-1 acn:ring-border"
        style={{ backgroundColor: BOOTSTRAP_CONTEXT_COLORS[value] ?? 'transparent' }}
      />
    )}
  />
)

export default ContextColorField
