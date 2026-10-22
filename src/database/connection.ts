import pg from 'pg'

import { pgClientOptions } from '../lib/database-readiness'

/**
 * A direct Postgres connection for the admin's database tools.
 *
 * The app talks to Payload's adapter (Drizzle over `@vercel/postgres`), which is the right client
 * for content. The tools need things the adapter does not expose: `VACUUM`, `REINDEX`, the
 * catalogs (`pg_class`, `pg_index`, `pg_constraint`) and multi-statement transactions. So they
 * open their own `pg` client with the same URL.
 *
 * `DATABASE_DIRECT_URL` is for Neon: the app can use the pooled endpoint (`…-pooler…`), but
 * maintenance (`VACUUM`, `REINDEX CONCURRENTLY`) and long dumps are better on the direct endpoint,
 * which the Neon console shows without `-pooler`. When it is not set, `POSTGRES_URL` is used.
 */

export const databaseUrl = (): string =>
  process.env.DATABASE_DIRECT_URL || process.env.POSTGRES_URL || ''

/** Host, port and database — never the credentials. */
export type DatabaseTarget = {
  host: string
  port: string
  database: string
  /** True when the URL is the pooled endpoint of a serverless database. */
  pooled: boolean
  /** Which variable supplied the URL. */
  source: 'DATABASE_DIRECT_URL' | 'POSTGRES_URL' | 'none'
}

export const databaseTarget = (): DatabaseTarget => {
  const source: DatabaseTarget['source'] = process.env.DATABASE_DIRECT_URL
    ? 'DATABASE_DIRECT_URL'
    : process.env.POSTGRES_URL
      ? 'POSTGRES_URL'
      : 'none'
  if (source === 'none') return { host: '', port: '', database: '', pooled: false, source }
  try {
    const parsed = new URL(databaseUrl())
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, ''),
      pooled: /-pooler\./.test(parsed.hostname),
      source,
    }
  } catch {
    return { host: '', port: '', database: '', pooled: false, source }
  }
}

/** Whether this looks like the serverless database the tools have special advice for. */
export const isServerless = (): boolean =>
  /\.neon\.tech$|\.vercel-storage\.com$/.test(databaseTarget().host)

export class DatabaseToolsError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'DatabaseToolsError'
  }
}

/**
 * Run `fn` with a connected client, always closing it. A failure to connect is reported with the
 * classified connection advice the app already uses (`describeConnectionError`), so the page shows
 * the same explanation a failed start does.
 */
export async function withDatabase<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = databaseUrl()
  if (!url) throw new DatabaseToolsError('Neither DATABASE_DIRECT_URL nor POSTGRES_URL is set.')

  const client = new pg.Client({ ...pgClientOptions(url), application_name: 'pocms-admin' })
  try {
    await client.connect()
  } catch (error) {
    const { connectionFailureOf, describeConnectionError } =
      await import('../lib/database-readiness')
    throw new DatabaseToolsError(describeConnectionError(connectionFailureOf(error)))
  }

  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

/**
 * Quote an identifier. Names always come from the catalogs (never from a request) *and* are
 * checked against them before use, so this is the second of the two safeguards.
 */
export const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

/** `public."my table"`. */
export const quoteTable = (name: string): string => `${quoteIdent('public')}.${quoteIdent(name)}`

const number = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export { number }
