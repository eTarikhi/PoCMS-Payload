import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Isolated loopback PostgreSQL integration suite (`pnpm test:int:postgres`).
 *
 * Requires `POSTGRES_LOCAL_TEST_URL` pointing to a dedicated disposable database on `127.0.0.1`
 * or `localhost`. Never imports `dotenv/config` or `.env`, never connects to Neon or any remote
 * host, and executes Payload 3.90.2's real `GRAPHQL_POST`, `REST_*`, and PostgreSQL adapter.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.postgres.int.spec.ts'],
    hookTimeout: 180_000,
    testTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    passWithNoTests: false,
  },
})
