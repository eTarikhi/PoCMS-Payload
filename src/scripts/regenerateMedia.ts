#!/usr/bin/env node
/**
 * Regenerates the derived image sizes for every document in the Media collection.
 *
 * Why this exists: adding a size in `src/collections/Media.ts` only affects future uploads. Files
 * uploaded earlier keep their old `sizes` object, so an admin thumbnail, card crop or Open Graph
 * image added later is missing until the file is processed again. This script re-reads each original
 * from the upload directory and updates the document with it, which runs sharp over the file and
 * writes every configured size.
 *
 * Usage:
 *   pnpm media:regenerate            # every document
 *   pnpm media:regenerate --dry-run  # list what would be processed
 *   pnpm media:regenerate --only=thumbnail,og   # check specific sizes afterwards
 *
 * It never deletes files: size files that no longer have a configured size stay on disk, and the
 * documents keep only the sizes Payload knows. Originals that are missing from the upload directory
 * are reported and skipped (Blob-backed deployments have no local originals to read).
 */

import 'dotenv/config.js'
import fs from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'

import config from '../payload.config.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const onlyArg = args.find((arg) => arg.startsWith('--only='))
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').filter(Boolean) : []

const uploadDir = (() => {
  const configured = process.env.MEDIA_DIR?.trim()
  if (configured) return path.resolve(process.cwd(), configured)
  return path.join(process.cwd(), 'media')
})()

const run = async () => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'media', pagination: false, depth: 0, sort: 'id' })

  payload.logger.info(`Regenerating image sizes for ${docs.length} media document(s) in ${uploadDir}`)
  if (dryRun) payload.logger.info('Dry run: nothing is written.')

  let updated = 0
  let skipped = 0
  const problems = []

  for (const doc of docs) {
    const filename = typeof doc.filename === 'string' ? doc.filename : null
    if (!filename) {
      problems.push(`${doc.id}: no filename`)
      skipped += 1
      continue
    }
    const filePath = path.join(uploadDir, filename)
    if (!fs.existsSync(filePath)) {
      problems.push(`${doc.id} ${filename}: original not found`)
      skipped += 1
      continue
    }

    if (dryRun) {
      payload.logger.info(`  would regenerate ${filename}`)
      continue
    }

    try {
      // Handing Payload the original file again is the supported path: it probes the image, runs
      // every configured size through sharp and updates `width`, `height`, `filesize` and `sizes`.
      await payload.update({
        collection: 'media',
        id: doc.id,
        filePath,
        data: {},
        context: { skipAudit: true },
      })
      const missing = only.filter((name) => {
        const sizes = doc.sizes as Record<string, unknown> | undefined
        return !sizes?.[name]
      })
      updated += 1
      payload.logger.info(
        `  ✓ ${filename}${missing.length > 0 ? ` (checked sizes exist: ${only.join(', ')})` : ''}`,
      )
    } catch (error) {
      problems.push(`${doc.id} ${filename}: ${error instanceof Error ? error.message : String(error)}`)
      skipped += 1
    }
  }

  if (problems.length > 0) {
    payload.logger.warn('Problems:')
    for (const problem of problems) payload.logger.warn(`  - ${problem}`)
  }
  payload.logger.info(`Done. Updated ${updated}, skipped ${skipped}.`)
  process.exit(problems.length > 0 && updated === 0 ? 1 : 0)
}

void run().catch((error) => {
  console.error(error)
  process.exit(1)
})
