import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Fail-closed Neon integration suite (`pnpm test:int:neon`).
 *
 * Separate from `vitest.config.mts` so `test:int` keeps its existing permissive
 * "skip when the database is unreachable" behaviour. This config requires an explicitly
 * identified disposable Neon branch and fails — it never skips — when that is missing.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/integration/neonFailClosedSetup.ts'],
    include: ['tests/integration/**/*.neon.int.spec.ts'],
    hookTimeout: 180_000,
    testTimeout: 120_000,
    // One shared Neon branch; never run these concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    passWithNoTests: false,
  },
})
