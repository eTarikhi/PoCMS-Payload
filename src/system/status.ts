/**
 * System page data (CR-12 E6): what the running deployment is, which integrations are configured,
 * which versions are installed and whether newer ones exist. Pure functions, so the page, the tests
 * and a future CLI share one source of truth. No value of a secret is ever returned.
 */

export type IntegrationStatus = {
  name: string
  label: string
  /** Every variable that must be set for the integration to work. */
  needs: readonly string[]
  /** True when all of `needs` is set. */
  configured: boolean
  /** What the integration powers, in the admin or on the site. */
  powers: string
}

const isSet = (env: NodeJS.ProcessEnv, name: string) => Boolean(env[name]?.trim())

/** Integrations, each with the variables it needs (see .env.example). */
export function integrationStatuses(env: NodeJS.ProcessEnv = process.env): IntegrationStatus[] {
  const status = (
    name: string,
    label: string,
    needs: string[],
    powers: string,
  ): IntegrationStatus => ({
    name,
    label,
    needs,
    configured: needs.every((variable) => isSet(env, variable)),
    powers,
  })
  return [
    status('database', 'Database', ['POSTGRES_URL'], 'All content and the admin'),
    status('blob', 'Blob storage', ['BLOB_READ_WRITE_TOKEN'], 'Media uploads'),
    status('email', 'Transactional email', ['RESEND_API_KEY'], 'Password resets and invitations'),
    status(
      'vercel',
      'Vercel API',
      ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'],
      'Site traffic and Deployments widgets',
    ),
    status('google', 'Google APIs', ['GOOGLE_API_KEY'], 'Page speed widget and its history'),
    status(
      'github',
      'GitHub Actions',
      ['GITHUB_REPOSITORY'],
      'CI status widget (GITHUB_TOKEN raises the rate limit)',
    ),
    status('cron', 'Scheduled jobs', ['CRON_SECRET'], 'The daily Vercel Cron call'),
    status('site', 'Public site address', ['NEXT_PUBLIC_SITE_URL'], 'Links, SEO and page speed'),
  ]
}

export type EnvironmentInfo = {
  label: 'Production' | 'Preview' | 'Development' | 'Test'
  detail: string
}

const environmentLabel = (value: string | undefined): EnvironmentInfo['label'] | null => {
  if (value === 'production') return 'Production'
  if (value === 'preview') return 'Preview'
  if (value === 'development') return 'Development'
  return null
}

/** Where this copy runs: Vercel's environment when present, otherwise NODE_ENV. */
export function environmentInfo(env: NodeJS.ProcessEnv = process.env): EnvironmentInfo {
  const vercel = environmentLabel(env.VERCEL_ENV)
  if (vercel) {
    const url = env.VERCEL_URL?.trim()
    return {
      label: vercel,
      detail: url ? `Vercel · ${url}` : 'Vercel',
    }
  }
  if (env.NODE_ENV === 'test') return { label: 'Test', detail: 'Node · test run' }
  const label = environmentLabel(env.NODE_ENV) ?? 'Development'
  return { label, detail: `Node · ${env.NODE_ENV ?? 'development'}` }
}

export type CommitInfo = {
  short: string
  full?: string
  ref?: string
  message?: string
  source: 'Vercel' | 'git' | 'unknown'
}

/** The deployed commit: Vercel's system variables, or what the view reads from local git. */
export function commitInfo(
  env: NodeJS.ProcessEnv = process.env,
  local?: { short: string; full: string; message: string } | null,
): CommitInfo {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (sha) {
    return {
      short: sha.slice(0, 7),
      full: sha,
      ref: env.VERCEL_GIT_COMMIT_REF?.trim() || undefined,
      message: env.VERCEL_GIT_COMMIT_MESSAGE?.trim() || undefined,
      source: 'Vercel',
    }
  }
  if (local) {
    return {
      short: local.short,
      full: local.full,
      message: local.message,
      source: 'git',
    }
  }
  return { short: 'unknown', source: 'unknown' }
}

/** `16.3.8` → [16, 3, 8]; a leading `v` and a prerelease suffix are ignored. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = /^[^\d]*(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Whether `latest` is a newer release than `current` (prereleases of the same version are not). */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index]
  }
  return false
}

export type PackageVersions = {
  payload: string
  next: string
  react: string
  node: string
  app: string
}

type PackageManifest = {
  version?: string
  dependencies?: Record<string, string>
}

/**
 * Versions to show: the ranges declared in package.json (the installed versions on a fresh
 * install), the running Node and the app's own version.
 */
export function packageVersions(
  manifest: PackageManifest,
  nodeVersion: string = process.version,
): PackageVersions {
  const dependency = (name: string) => manifest.dependencies?.[name] ?? 'not declared'
  return {
    app: manifest.version ?? 'unknown',
    payload: dependency('payload'),
    next: dependency('next'),
    react: dependency('react'),
    node: nodeVersion,
  }
}

/** Bytes for people: “12.4 MB”, “640 kB”. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–'
  if (bytes < 1024) return `${bytes} B`
  const units = ['kB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
