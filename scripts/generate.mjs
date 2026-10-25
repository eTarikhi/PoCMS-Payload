#!/usr/bin/env node
/**
 * Runs Payload's code generators with a production-shaped configuration.
 *
 * The Vercel Blob storage plugin adds fields (media._objectKey) only when BLOB_READ_WRITE_TOKEN is
 * set, so generating without a token (the normal local setup) produced different types, Drizzle
 * schema and GraphQL schema than production. This wrapper supplies a placeholder token in the
 * documented format when none is set; generators never call the Blob API. `typescript.autoGenerate`
 * is off in payload.config.ts, so these committed files change only through this script (CI checks
 * that they are up to date).
 *
 *   node scripts/generate.mjs types importmap db-schema graphql
 */
import { spawnSync } from 'node:child_process'

const GENERATORS = {
  types: ['payload', ['generate:types']],
  importmap: ['payload', ['generate:importmap']],
  'db-schema': ['payload', ['generate:db-schema']],
  graphql: ['payload-graphql', ['generate:schema']],
}

const env = {
  ...process.env,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_codegen0_placeholder0',
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'codegen-placeholder-secret',
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' '),
  PAYLOAD_CONFIG_PATH: process.env.PAYLOAD_CONFIG_PATH || 'src/payload.config.ts',
}

const requested = process.argv.slice(2)
if (requested.length === 0 || requested.some((name) => !(name in GENERATORS))) {
  console.error(`Usage: node scripts/generate.mjs <${Object.keys(GENERATORS).join('|')}>...`)
  process.exit(1)
}

for (const name of requested) {
  const [command, args] = GENERATORS[name]
  const result = spawnSync(command, args, { env, shell: process.platform === 'win32', stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
