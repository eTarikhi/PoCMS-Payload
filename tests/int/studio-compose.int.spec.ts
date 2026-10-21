import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
const compose = parse(readFileSync('docker-compose.yml', 'utf8'))
describe('Local PostgreSQL Compose contract (not an engine smoke test)', () => {
  it('uses an ordinary PostgreSQL service and explicitly selects the native adapter', () => {
    expect(compose.services.mongo).toBeUndefined()
    expect(compose.services.postgres.image).toBe('postgres:17')
    expect(compose.services.payload.environment.DATABASE_ADAPTER).toBe('postgres')
    expect(compose.services.payload.environment.POSTGRES_URL).toContain('@postgres:5432/pocms')
  })
  it('waits for database health and keeps database ports private', () => {
    expect(compose.services.payload.depends_on.postgres.condition).toBe('service_healthy')
    expect(compose.services.postgres.ports).toBeUndefined()
    expect(compose.services.postgres.healthcheck.test).toEqual([
      'CMD-SHELL',
      'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"',
    ])
  })
  it('requires explicit secrets rather than hardcoded default passwords', () => {
    expect(compose.services.postgres.environment.POSTGRES_PASSWORD).toContain(
      '${POCMS_POSTGRES_PASSWORD:?',
    )
    expect(compose.services.payload.environment.PAYLOAD_SECRET).toContain('${PAYLOAD_SECRET:?')
  })
  it('retains dedicated data and dependency volumes without reusing the old Mongo volume', () => {
    expect(compose.services.postgres.volumes).toEqual(['postgres_data:/var/lib/postgresql/data'])
    expect(compose.volumes).toHaveProperty('postgres_data')
    expect(compose.volumes).not.toHaveProperty('data')
  })
  it('pins the package manager, uses a frozen lockfile and binds the container server externally', () => {
    expect(compose.services.payload.command).toContain('pnpm@10.17.1')
    expect(compose.services.payload.command).toContain('--frozen-lockfile')
    expect(compose.services.payload.command).toContain('--hostname 0.0.0.0')
    expect(compose.services.payload.ports).toEqual(['127.0.0.1:3000:3000'])
    expect(compose.services.payload.init).toBe(true)
  })
})
