import { describe, expect, it } from 'vitest'
import { assertIntegrationEnvironment } from '../../scripts/integration/safety'
const env = {
  POCMS_INTEGRATION: '1',
  POSTGRES_URL: 'postgres://test@127.0.0.1:55432/pocms_integration',
  PAYLOAD_SECRET: 'fixture-only',
  INTEGRATION_ADMIN_PASSWORD: 'fixture-only',
}
describe('Integration write guard', () => {
  it('accepts an explicitly opted-in isolated loopback database', () => {
    expect(() => assertIntegrationEnvironment(env)).not.toThrow()
  })
  it.each([
    { ...env, POCMS_INTEGRATION: '' },
    { ...env, POSTGRES_URL: 'postgres://test@db.example.com/pocms_integration' },
    { ...env, POSTGRES_URL: 'postgres://test@localhost/production' },
    { ...env, INTEGRATION_ADMIN_PASSWORD: '' },
  ])('rejects a missing guard, remote database, production name or missing secret', (value) => {
    expect(() => assertIntegrationEnvironment(value)).toThrow()
  })
})
