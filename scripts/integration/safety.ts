/** This harness may only write to an explicitly opted-in, loopback integration database. */
export function assertIntegrationEnvironment(env: Record<string, string | undefined> = process.env) {
  if (env.POCMS_INTEGRATION !== '1')
    throw new Error('Set POCMS_INTEGRATION=1 for the isolated integration harness.')
  let url: URL
  try {
    url = new URL(env.POSTGRES_URL || '')
  } catch {
    throw new Error('A valid isolated POSTGRES_URL is required.')
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_integration'))
    throw new Error(
      'Integration harness requires a loopback database with a name ending in _integration.',
    )
  if (!env.PAYLOAD_SECRET || !env.INTEGRATION_ADMIN_PASSWORD)
    throw new Error('Integration secrets must be supplied privately in the environment.')
}
