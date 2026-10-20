import type { Endpoint } from 'payload'

import { hasCapability } from '@/access/permissions'

/**
 * GET /api/migration-status (admins, every environment): the migrations recorded in this
 * database (Payload's internal `payload-migrations` collection, which has no REST API), newest
 * first. In development with schema push, a `dev` entry (batch -1) marks pushed changes.
 */
export const migrationStatusEndpoint: Endpoint = {
  path: '/migration-status',
  method: 'get',
  handler: async (req) => {
    if (!hasCapability(req.user, 'useDeveloperTools'))
      return Response.json({ error: 'Needs the Developer tools permission.' }, { status: 403 })
    const { docs, totalDocs } = await req.payload.find({
      collection: 'payload-migrations',
      sort: '-createdAt',
      limit: 50,
      depth: 0,
    })
    return Response.json({
      environment: process.env.NODE_ENV,
      total: totalDocs,
      migrations: docs.map((doc) => ({
        name: doc.name,
        batch: doc.batch,
        appliedAt: doc.createdAt,
      })),
    })
  },
}
