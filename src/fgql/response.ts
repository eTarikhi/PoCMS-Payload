import { normalizeGraphQLUnionAliases } from './normalize'

export type GraphQLListEnvelope<TDoc> = {
  docs: TDoc[]
  totalDocs: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

/**
 * Extracts and normalizes a GraphQL object field (`SiteSetting`, `Header`, `Navigation`, `Footer`)
 * from a persisted GraphQL `data` payload.
 */
export const readGraphQLObject = <T>(data: unknown, fieldName: string): T => {
  if (!isRecord(data)) {
    throw new Error(`GraphQL response data is missing object root for "${fieldName}".`)
  }
  const value = data[fieldName]
  if (!isRecord(value)) {
    throw new Error(`GraphQL response field "${fieldName}" returned no object.`)
  }
  return normalizeGraphQLUnionAliases(value) as T
}

/**
 * Extracts and normalizes a Payload GraphQL collection list (`{ docs, totalDocs }`).
 */
export const readGraphQLList = <TDoc>(
  data: unknown,
  fieldName: string,
): GraphQLListEnvelope<TDoc> => {
  if (!isRecord(data)) {
    throw new Error(`GraphQL response data is missing list root for "${fieldName}".`)
  }
  const list = data[fieldName]
  if (!isRecord(list) || !Array.isArray(list.docs) || typeof list.totalDocs !== 'number') {
    throw new Error(`GraphQL response field "${fieldName}" is missing { docs, totalDocs }.`)
  }
  return {
    docs: normalizeGraphQLUnionAliases(list.docs) as TDoc[],
    totalDocs: list.totalDocs,
  }
}

/**
 * Extracts a collection list and throws if the fixed persisted query limit truncated the result
 * (`docs.length < totalDocs`), triggering the caller's authorized Local API fallback.
 */
export const readCompleteGraphQLList = <TDoc>(data: unknown, fieldName: string): TDoc[] => {
  const { docs, totalDocs } = readGraphQLList<TDoc>(data, fieldName)
  if (docs.length < totalDocs) {
    throw new Error(
      `Persisted GraphQL list "${fieldName}" returned ${docs.length} of ${totalDocs} rows (truncated).`,
    )
  }
  return docs
}

export const logPersistedQueryFallback = (operationId: string, error: unknown): void => {
  if (process.env.NODE_ENV === 'test') return
  const reason = error instanceof Error ? error.message : String(error)
  console.error(
    `[fgql] Persisted operation "${operationId}" failed (${reason}); using the authorized Local API fallback.`,
  )
}

export const logPersistedQueryFallbackFailure = (operationId: string, error: unknown): void => {
  if (process.env.NODE_ENV === 'test') return
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`[fgql] Authorized Local API fallback failed for "${operationId}": ${reason}`)
}
