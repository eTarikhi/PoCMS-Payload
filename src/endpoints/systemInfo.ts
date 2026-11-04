import type { Endpoint } from 'payload'

import { hasCapability } from '@/access/permissions'
import { collectSystemInfo } from '@/lib/systemInfo'

/**
 * GET /api/system-info (requires `viewSystem` capability):
 * Returns live versions, runtime memory/uptime, PostgreSQL/Neon connection health, and integration status.
 */
export const systemInfoEndpoint: Endpoint = {
  path: '/system-info',
  method: 'get',
  handler: async (req) => {
    if (!hasCapability(req.user, 'viewSystem')) {
      return Response.json(
        { error: 'Needs the System information permission.' },
        { status: 403 },
      )
    }
    const report = await collectSystemInfo(req.payload)
    return Response.json(report)
  },
}
