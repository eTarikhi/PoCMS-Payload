'use client'

import type { SelectFieldClientComponent } from 'payload'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faCode, faCodeBranch, faCropAlt, faLaptopCode } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'

import { OptionTiles } from './OptionTiles'

/** The Font Awesome icons the public site maps for services (src/app/(frontend)/components/icons.tsx). */
export const SERVICE_ICONS: Record<string, IconDefinition> = {
  faCode,
  faCropAlt,
  faLaptopCode,
  faCodeBranch,
}

/** Services icon: the actual icons as tiles, so editors see what the site will show. */
export const ServiceIconField: SelectFieldClientComponent = (props) => (
  <OptionTiles
    {...props}
    renderVisual={(value) =>
      SERVICE_ICONS[value] ? (
        <FontAwesomeIcon icon={SERVICE_ICONS[value]} className="acn:size-4" aria-hidden />
      ) : null
    }
  />
)

export default ServiceIconField
