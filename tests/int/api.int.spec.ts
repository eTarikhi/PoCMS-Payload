import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { assertIntegrationEnvironment } from '../../scripts/integration/safety'

let payload: Payload

describe('API', () => {
  beforeAll(async () => {
    assertIntegrationEnvironment()
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})
