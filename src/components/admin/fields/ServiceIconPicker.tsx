'use client'

import type { SelectFieldClientComponent } from 'payload'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'

import { OptionTiles } from './OptionTiles'
import { SERVICE_ICONS } from './serviceIcons'

/** Services icon: the actual icons as tiles, so editors see what the site will show. */
export const ServiceIconPicker: SelectFieldClientComponent = (props) => (
  <OptionTiles
    {...props}
    renderVisual={(value) =>
      SERVICE_ICONS[value] ? (
        <FontAwesomeIcon icon={SERVICE_ICONS[value]} className="acn:size-4" aria-hidden />
      ) : null
    }
  />
)

export default ServiceIconPicker
