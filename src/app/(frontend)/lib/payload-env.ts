import { connection } from 'next/server'

/**
 * Environment variables Payload needs to start (src/payload.config.ts). Vercel builds every
 * deployment with the variables of its environment (Production, Preview or Development), so a
 * Preview deployment fails if they are only set for Production.
 */
const REQUIRED = ['PAYLOAD_SECRET', 'POSTGRES_URL'] as const

/** The required variables that are missing or empty in this process. */
export const missingPayloadEnv = (): string[] =>
  REQUIRED.filter((name) => !process.env[name]?.trim())

const describe = (missing: string[]) =>
  `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set`

const missingEnvError = (missing: string[]) =>
  new Error(
    `Payload cannot start: ${describe(missing)} for this deployment. Add ${missing.length > 1 ? 'them' : 'it'} in Vercel > Project > Settings > Environment Variables for this environment (Production or Preview), then redeploy.`,
  )

/**
 * For routes that only render on request without the environment (the article pages, whose
 * `generateStaticParams` prebuilds nothing then): fail with an error that names the variables,
 * instead of Payload's "missing secret key".
 */
export function assertPayloadEnv(): void {
  const missing = missingPayloadEnv()
  if (missing.length > 0) throw missingEnvError(missing)
}

let warned = false

/**
 * For routes prerendered at build time (the home page): call at the top of the page, before any
 * cached data function. With the environment in place it does nothing and the page prerenders as
 * usual. Without it, `next build` would fail while prerendering ("missing secret key"); instead the
 * page opts out of prerendering (`connection()` marks it dynamic), so the build succeeds and says
 * why in its log, and on a request the page fails with an error that names the variables to set.
 */
export async function ensurePayloadEnv(): Promise<void> {
  const missing = missingPayloadEnv()
  if (missing.length === 0) return
  if (!warned) {
    warned = true
    console.warn(
      `[frontend] ${describe(missing)}: pages that read Payload are not prerendered and fail until ${missing.length > 1 ? 'they are' : 'it is'} set (Vercel > Project > Settings > Environment Variables, for this environment).`,
    )
  }
  // During `next build` this throws Next's internal "dynamic rendering" signal, so nothing below
  // runs and the route renders on request instead. On a request it resolves.
  await connection()
  throw missingEnvError(missing)
}
