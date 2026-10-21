import { postgresAdapter } from '@payloadcms/db-postgres'
import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'

/** Explicit transport selection: keep hosted deployments unchanged; ordinary PostgreSQL is opt-in. */
export function createDatabaseAdapter(env: Record<string, string | undefined> = process.env) {
  const adapter = env.DATABASE_ADAPTER?.trim() || 'vercel'
  const options = { pool: { connectionString: env.POSTGRES_URL || '' } }
  if (adapter === 'vercel') return vercelPostgresAdapter(options)
  if (adapter === 'postgres') return postgresAdapter(options)
  // Never include the connection string, credentials or the supplied value in configuration errors.
  throw new Error('Invalid DATABASE_ADAPTER. Choose vercel or postgres.')
}
