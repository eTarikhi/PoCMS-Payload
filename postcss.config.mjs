// Tailwind CSS v4 runs only on stylesheets that use Tailwind at-rules (@import, @theme, @apply, …):
// src/styles/admin/admin-ui.css. The frontend's Bootstrap CSS and Payload's CSS are left untouched.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config