// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSchema } from 'graphql'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import configPromise from '@payload-config'
import { PUBLISHED_OR_LEGACY_WHERE } from '@/access/roles'
import { draftPreviewEndpoint } from '@/endpoints/draftPreview'

const anonymousUser = null

type AccessArguments = {
  req: { user: unknown }
  data?: unknown
}

type AccessEntry = {
  slug: string
  access?: Record<string, unknown>
  fields?: unknown
}

type PayloadConfigForContract = {
  collections: AccessEntry[]
  globals: AccessEntry[]
}

type FieldConfig = {
  name?: unknown
  type?: unknown
  fields?: unknown
  tabs?: unknown
  access?: Record<string, unknown>
}

let config: PayloadConfigForContract

beforeAll(async () => {
  config = (await configPromise) as unknown as PayloadConfigForContract
})

const findEntry = (entries: AccessEntry[], slug: string): AccessEntry => {
  const entry = entries.find((candidate) => candidate.slug === slug)

  if (!entry) {
    throw new Error(`Payload config does not contain "${slug}"`)
  }

  return entry
}

const callAccess = async (
  entry: AccessEntry,
  operation: string,
  user: unknown = anonymousUser,
): Promise<unknown> => {
  const access = entry.access?.[operation]

  if (typeof access !== 'function') {
    return access
  }

  return await (access as unknown as (args: AccessArguments) => unknown)({
    req: { user },
    data: undefined,
  })
}

const collectFields = (
  value: unknown,
  path: string[] = [],
): Array<{ field: FieldConfig; path: string[] }> => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const field = item as FieldConfig
    const name = typeof field.name === 'string' ? field.name : '(unnamed)'
    const fieldPath = [...path, name]
    const nested: unknown[] = []

    if (Array.isArray(field.fields)) {
      nested.push(field.fields)
    }

    if (Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        if (tab && typeof tab === 'object' && Array.isArray((tab as { fields?: unknown }).fields)) {
          nested.push((tab as { fields: unknown }).fields)
        }
      }
    }

    const descendants = nested.flatMap((childFields) => collectFields(childFields, fieldPath))
    return [{ field, path: fieldPath }, ...descendants]
  })
}

describe('public GraphQL access contract', () => {
  it('keeps public content reads and filters anonymous Article and Project reads to published or legacy rows', async () => {
    for (const slug of [
      'about',
      'experiences',
      'educations',
      'certificates',
      'services',
      'skills',
      'media',
      'forms',
      'redirects',
    ]) {
      await expect(callAccess(findEntry(config.collections, slug), 'read'), slug).resolves.toBe(
        true,
      )
    }

    for (const slug of ['header', 'navigation', 'footer', 'site-settings']) {
      await expect(callAccess(findEntry(config.globals, slug), 'read'), slug).resolves.toBe(true)
    }

    for (const slug of ['articles', 'projects']) {
      await expect(callAccess(findEntry(config.collections, slug), 'read'), slug).resolves.toEqual(
        PUBLISHED_OR_LEGACY_WHERE,
      )
      await expect(
        callAccess(findEntry(config.collections, slug), 'readVersions'),
        `${slug} readVersions`,
      ).resolves.toBe(false)
    }
  })

  it('denies anonymous reads of internal, administrative, inbox, and Payload system collections', async () => {
    const internalCollections = [
      'users',
      'roles',
      'audit-logs',
      'form-submissions',
      'mail-threads',
      'mail-messages',
      'mail-attachments',
      'mail-labels',
      'mail-webhook-events',
      'payload-kv',
      'payload-jobs',
      'payload-folders',
      'payload-locked-documents',
      'payload-preferences',
      'payload-migrations',
      'payload-query-presets',
    ]

    for (const slug of internalCollections) {
      await expect(callAccess(findEntry(config.collections, slug), 'read'), slug).resolves.toBe(
        false,
      )
    }

    await expect(callAccess(findEntry(config.globals, 'payload-jobs-stats'), 'read')).resolves.toBe(
      false,
    )
  })

  it('keeps Forms.emails private and form submissions write-only for anonymous visitors', async () => {
    const forms = findEntry(config.collections, 'forms')
    const emails = collectFields(forms.fields).find(({ field }) => field.name === 'emails')

    expect(emails, 'the configured Forms.emails field').toBeDefined()
    expect(typeof emails?.field.access?.read).toBe('function')

    if (emails) {
      const readAccess = emails.field.access?.read
      const result = await (readAccess as (args: AccessArguments) => unknown)({
        req: { user: anonymousUser },
      })
      expect(result).toBe(false)
    }

    const submissions = findEntry(config.collections, 'form-submissions')
    await expect(callAccess(submissions, 'create')).resolves.toBe(true)
    await expect(callAccess(submissions, 'read')).resolves.toBe(false)
    await expect(callAccess(submissions, 'update')).resolves.toBe(false)
    await expect(callAccess(submissions, 'delete')).resolves.toBe(false)

    const formClient = readFileSync(
      resolve(process.cwd(), 'src/app/(frontend)/components/contact/CmsFormSection.tsx'),
      'utf8',
    )
    expect(formClient).toContain("fetch('/api/form-submissions'")
  })

  it('records the current public form-submission mutation surface without adding it to the read contract', async () => {
    const schema = buildSchema(readFileSync(resolve(process.cwd(), 'schema.graphql'), 'utf8'))
    const mutationFields = schema.getMutationType()?.getFields()

    expect(mutationFields?.createFormSubmission).toBeDefined()
    await expect(
      callAccess(findEntry(config.collections, 'form-submissions'), 'create'),
    ).resolves.toBe(true)
  })

  it('preserves CustomCode read restrictions and rejects anonymous draft-preview requests before data access', async () => {
    const customCode = findEntry(config.globals, 'custom-code')
    await expect(callAccess(customCode, 'read')).resolves.toBe(false)
    await expect(callAccess(customCode, 'readVersions')).resolves.toBe(false)
    await expect(callAccess(customCode, 'update')).resolves.toBe(false)

    const codeFields = collectFields(customCode.fields).filter(({ field }) => field.type === 'code')
    expect(codeFields.length).toBeGreaterThan(0)

    for (const { field, path } of codeFields) {
      expect(typeof field.access?.create, `${path.join('.')}.create`).toBe('function')
      expect(typeof field.access?.update, `${path.join('.')}.update`).toBe('function')

      const createAccess = field.access?.create as (args: AccessArguments) => unknown
      const updateAccess = field.access?.update as (args: AccessArguments) => unknown
      expect(await createAccess({ req: { user: anonymousUser } }), path.join('.')).toBe(false)
      expect(await updateAccess({ req: { user: anonymousUser } }), path.join('.')).toBe(false)
    }

    const payload = { find: vi.fn() }
    const response = await draftPreviewEndpoint.handler?.({
      url: 'http://localhost/api/draft?collection=articles&slug=phase0-draft-probe',
      user: anonymousUser,
      payload,
    } as never)

    expect(response).toBeInstanceOf(Response)
    expect(response?.status).toBe(401)
    expect(payload.find).not.toHaveBeenCalled()

    const payloadSource = readFileSync(
      resolve(process.cwd(), 'src/app/(frontend)/lib/payload-source.ts'),
      'utf8',
    )
    const articleDraftReader = payloadSource.slice(
      payloadSource.indexOf('export const fetchArticleBySlug'),
      payloadSource.indexOf('export const fetchPublishedArticleSlugs'),
    )
    const projectDraftReader = payloadSource.slice(
      payloadSource.indexOf('export const fetchProjectBySlug'),
      payloadSource.indexOf('export const fetchPublishedProjectSlugs'),
    )
    const customCodeReader = payloadSource.slice(
      payloadSource.indexOf('export const fetchCustomCodeGlobal'),
      payloadSource.indexOf('/** Fetches the Home-only profile collections'),
    )

    expect(articleDraftReader).toContain('draft: true')
    expect(projectDraftReader).toContain('draft: true')
    // Draft preview branch uses Local API without overrideAccess; only the published fallback sets overrideAccess: false.
    expect(articleDraftReader).not.toContain('overrideAccess: true')
    expect(projectDraftReader).not.toContain('overrideAccess: true')
    expect(articleDraftReader).toContain('overrideAccess: false')
    expect(projectDraftReader).toContain('overrideAccess: false')
    expect(customCodeReader).not.toContain('overrideAccess')
  })
})
