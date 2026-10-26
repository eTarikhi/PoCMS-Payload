import pg from 'pg'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

let payload: Payload | null = null
let dbReachable = false

async function canReachPostgres(connectionString: string | undefined): Promise<boolean> {
  const url = connectionString?.trim()
  if (!url) return false

  let isLocal = false
  try {
    const parsed = new URL(url)
    isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }

  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: isLocal ? 2_500 : 20_000,
  })
  try {
    await client.connect()
    await client.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => undefined)
  }
}

describe('API', () => {
  beforeAll(async () => {
    dbReachable = await canReachPostgres(process.env.POSTGRES_URL)
    if (!dbReachable) return

    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterAll(async () => {
    if (payload?.db?.destroy) {
      await payload.db.destroy().catch(() => undefined)
    }
  })

  it('fetches users', async (ctx) => {
    if (!dbReachable || !payload) {
      ctx.skip()
      return
    }

    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})
