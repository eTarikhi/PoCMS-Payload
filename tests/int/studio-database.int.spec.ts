import { beforeEach, describe, expect, it, vi } from 'vitest'
const adapters = vi.hoisted(() => ({
  native: vi.fn(() => ({ name: 'native' })),
  vercel: vi.fn(() => ({ name: 'vercel' })),
}))
vi.mock('@payloadcms/db-postgres', () => ({ postgresAdapter: adapters.native }))
vi.mock('@payloadcms/db-vercel-postgres', () => ({ vercelPostgresAdapter: adapters.vercel }))
import { createDatabaseAdapter } from '@/utilities/database'
beforeEach(() => vi.clearAllMocks())
describe('Explicit PostgreSQL transport selection', () => {
  it('preserves the Vercel adapter by default', () => {
    createDatabaseAdapter({ POSTGRES_URL: 'postgres://role@host.example/db' })
    expect(adapters.vercel).toHaveBeenCalledWith({
      pool: { connectionString: 'postgres://role@host.example/db' },
    })
    expect(adapters.native).not.toHaveBeenCalled()
  })
  it('selects the native adapter for ordinary service-name hosts only with explicit opt-in', () => {
    createDatabaseAdapter({
      DATABASE_ADAPTER: 'postgres',
      POSTGRES_URL: 'postgres://role@postgres:5432/db',
    })
    expect(adapters.native).toHaveBeenCalledWith({
      pool: { connectionString: 'postgres://role@postgres:5432/db' },
    })
    expect(adapters.vercel).not.toHaveBeenCalled()
  })
  it('does not infer a transport change from the URL hostname', () => {
    createDatabaseAdapter({ POSTGRES_URL: 'postgres://role@postgres:5432/db' })
    expect(adapters.vercel).toHaveBeenCalledOnce()
    expect(adapters.native).not.toHaveBeenCalled()
  })
  it('supports an explicit vercel value and trimmed deployment environment values', () => {
    createDatabaseAdapter({ DATABASE_ADAPTER: ' vercel ' })
    expect(adapters.vercel).toHaveBeenCalledOnce()
  })
  it('rejects unknown modes without exposing supplied secrets', () => {
    expect(() =>
      createDatabaseAdapter({
        DATABASE_ADAPTER: 'private-secret',
        POSTGRES_URL: 'postgres://private:secret@db/private',
      }),
    ).toThrow('Invalid DATABASE_ADAPTER. Choose vercel or postgres.')
    expect(adapters.native).not.toHaveBeenCalled()
    expect(adapters.vercel).not.toHaveBeenCalled()
  })
})
