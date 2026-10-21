import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Node, not jsdom: the integration tests exercise the Local API and the job tasks. jsdom's
    // TextEncoder returns a Uint8Array from another realm, which jose (JWT signing for
    // payload.login) rejects; React component tests opt into jsdom per file instead.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts', 'tests/unit/**/*.spec.tsx'],
    // Every file calls getPayload(), which pushes the dev schema to an empty database. In parallel
    // the pushes race (duplicate CREATE TYPE on a fresh CI database), so run files one at a time.
    fileParallelism: false,
  },
})
