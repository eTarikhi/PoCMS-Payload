import { cookies } from 'next/headers'
import React from 'react'

import { NAV_RAIL_COOKIE } from './navRail'
import { SidebarToggleButton } from './Button'

/** `beforeNavLinks`: the sidebar collapse control, with the remembered state read on the server. */
export async function SidebarToggle() {
  const initialRail = (await cookies()).get(NAV_RAIL_COOKIE)?.value === '1'
  return <SidebarToggleButton initialRail={initialRail} />
}

export default SidebarToggle
