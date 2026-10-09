'use client'

import { useEffect } from 'react'

// Ported from the Libraries component in vTarikhi/components/libraries.jsx. The original loaded the bundle with
// a dynamic import() inside useEffect, and this keeps that pattern (D-15). The bundle sets up Bootstrap's
// data-api toggles, tabs, and scrollspy in the browser only.

// Renders nothing. Its only job is to load the Bootstrap JavaScript once, after the page is in the browser.
export function BootstrapClient() {
  useEffect(() => {
    void import('bootstrap/dist/js/bootstrap.bundle.js')
  }, [])

  return null
}
