/**
 * PostCSS configuration.
 *
 * The only plugin registered is Tailwind CSS v4 (`@tailwindcss/postcss`), which is
 * required by the TailAdmin admin-UI pilot stylesheet:
 *
 *   src/admin-ui/tailadmin/styles/tailadmin.css
 *
 * Safety notes
 * ------------
 * `@tailwindcss/postcss` performs a "quick bail" check on every CSS/SCSS file it
 * sees: unless a file contains one of the Tailwind at-rules (`@import`, `@theme`,
 * `@utility`, `@variant`, `@plugin`, `@apply`, `@tailwind`, `@reference`) the file
 * is passed through completely untouched.
 *
 * That matters for this repository because the frontend still ships Bootstrap
 * (`src/app/(frontend)/styles/*.css`) and Payload ships its own pre-compiled
 * admin stylesheet (`@payloadcms/next/css`). None of those files contain Tailwind
 * at-rules, so they are never rewritten by this plugin.
 *
 * Content detection is additionally pinned to `src/admin-ui/**` with an explicit
 * `source(none)` + `@source` pair inside the TailAdmin stylesheet, so Bootstrap
 * class names used by the frontend (`.mt-4`, `.p-3`, `.text-center`, ...) can
 * never be compiled into Tailwind utilities and can never fight Bootstrap.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
