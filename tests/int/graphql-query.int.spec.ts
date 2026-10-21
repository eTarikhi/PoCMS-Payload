import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { documentQuery, MAX_GRAPHQL_DEPTH } from '@/components/admin/views/GraphQL/query'
import config from '@/payload.config'

/** The GraphQL tab's query builder, against Payload's real schema. */
describe('GraphQL document query', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('builds one query per depth for a collection document', () => {
    const query = documentQuery({
      collectionConfig: payload.collections.articles.config,
      payload,
    })
    expect(query).not.toBeNull()
    expect(query!.field).toBe('Article')
    expect(query!.idType).toBe('Int!')
    // Articles keep versions with drafts (scheduled publishing), so the query takes the draft argument.
    expect(query!.args).toEqual({ draft: true, fallbackLocale: false, locale: false, trash: true })
    expect(query!.queries).toHaveLength(MAX_GRAPHQL_DEPTH + 1)
    // Depth 0: the image relationship selects only its id; depth 1 expands it.
    expect(query!.queries[0]).toMatch(/image \{\s+id\s+\}/)
    expect(query!.queries[1]).toMatch(/image \{\s+id\s+alt/)
    // Drafts are enabled on Articles, so the query declares `$draft` too (before `$trash`).
    expect(query!.queries[0]).toContain('query GetArticle($id: Int!, $draft: Boolean, $trash: Boolean)')
  })

  it('builds the query for a global (no id argument)', () => {
    const query = documentQuery({ globalConfig: payload.globals.config[0], payload })
    expect(query?.field).toBe('Footer')
    expect(query?.queries[0]).toContain('Footer {')
    expect(query?.idType).toBeUndefined()
  })
})
