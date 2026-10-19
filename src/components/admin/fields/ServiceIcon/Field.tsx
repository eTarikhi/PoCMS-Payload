'use client'

import dynamic from 'next/dynamic'

/**
 * Field entry point registered in the import map. Font Awesome loads only where the field renders
 * (Services edit view) instead of in every admin page's bundle.
 */
export const ServiceIconField = dynamic(() =>
  import('./Picker').then((mod) => mod.ServiceIconPicker),
)

export default ServiceIconField
