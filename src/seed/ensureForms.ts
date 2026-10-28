import type { Payload } from 'payload'

import { FORMS_COLLECTION } from '@/plugins/formBuilder'

import { formsData } from './forms'

/**
 * Ensures default CMS forms (`contact` and `request-cv`) exist on first startup when the `forms`
 * collection is empty, without overwriting or touching databases that already have forms configured.
 */
export async function ensureDefaultForms(payload: Payload): Promise<number> {
  try {
    const existing = await payload.count({
      collection: FORMS_COLLECTION,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) return 0

    let created = 0
    for (const formItem of formsData()) {
      await payload.create({
        collection: FORMS_COLLECTION,
        data: formItem,
        overrideAccess: true,
        context: { skipAuditLog: true, skipRevalidate: true },
      })
      created += 1
    }

    if (created > 0) {
      payload.logger.info(`[forms] Seeded ${created} default CMS forms (contact, request-cv).`)
    }
    return created
  } catch {
    // Gracefully skip during offline unit/integration runs without a live PostgreSQL server.
    return 0
  }
}
