import React from 'react'

/**
 * Loads the shared Open Sans family in the admin panel (rendered in the admin
 * header slot on every page; React 19 hoists the stylesheet link into <head>).
 * Offline / blocked-network environments fall back to the system sans stack
 * defined in custom.scss — layout and weights stay intact either way.
 */
export const AdminFonts: React.FC = () => {
  return (
    // Hoisted app-wide by React 19 on every admin route (not a single page).
    // eslint-disable-next-line @next/next/no-page-custom-font
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap"
    />
  )
}

export default AdminFonts
