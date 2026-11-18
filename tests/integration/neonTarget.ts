/**
 * Neon endpoint-id helpers for the integration harness.
 *
 * Deliberately self-contained rather than importing from `src/plugins/databaseManager/shared.ts`:
 * that module pulls in admin UI types, and the harness must stay importable from a bare test
 * runner. The parsing rule mirrors `extractNeonEndpointIdFromHost` in that module, and a check in
 * `tests/int/neon-harness-guards.int.spec.ts` keeps the two in agreement.
 */

/**
 * Extracts a Neon compute endpoint id (`ep-...`) from a pooled or direct Neon hostname.
 *
 * Example: `ep-cool-morning-a2bc-pooler.eu-central-1.aws.neon.tech` -> `ep-cool-morning-a2bc`
 *
 * @returns the endpoint id, or `null` when the hostname is not a Neon endpoint host.
 */
export function detectNeonEndpointId(host: string | null | undefined): string | null {
  if (!host) return null
  const firstLabel = host.trim().toLowerCase().split('.')[0] ?? ''
  if (!firstLabel.startsWith('ep-')) return null
  return firstLabel.endsWith('-pooler') ? firstLabel.slice(0, -'-pooler'.length) : firstLabel
}

/** True when the hostname is a Neon serverless Postgres host. */
export function isNeonHost(host: string | null | undefined): boolean {
  if (!host) return false
  return host.trim().toLowerCase().endsWith('.neon.tech')
}
