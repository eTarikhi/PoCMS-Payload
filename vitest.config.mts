import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Every file calls getPayload(), which pushes the dev schema to an empty database. In parallel
    // the pushes race (duplicate CREATE TYPE on a fresh CI database), so run files one at a time.
    fileParallelism: false,
  },
})
