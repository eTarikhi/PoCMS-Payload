import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Fail-closed PostgreSQL integration suite.
 *
 * Separate from `vitest.config.mts` on purpose: `test:int` keeps its existing permissive
 * "skip when the database is unreachable" behaviour, while this config requires a reachable
 * disposable PostgreSQL 16 and fails if anything is missing.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/integration/failClosedSetup.ts'],
    include: ['tests/integration/**/*.pg.int.spec.ts'],
    hookTimeout: 120_000,
    testTimeout: 120_000,
    // Integration specs share one database; never run them concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    // A skipped database spec is the exact failure this config exists to prevent.
    passWithNoTests: false,
  },
})
