import configPromise from '@payload-config'
import { GRAPHQL_POST } from '@payloadcms/next/routes'
import { headersWithCors, type PayloadRequest, type SanitizedConfig } from 'payload'

import {
  PERSISTED_QUERY_REGISTRY,
  validatePersistedEnvelope,
  type PersistedQueryId,
  type ValidatedPersistedVariables,
} from './persistedQueryRegistry'

type GraphQLPostHandler = (request: Request) => Promise<Response>

let cachedHandlerConfig: Promise<SanitizedConfig> | SanitizedConfig | null = null
let cachedGraphQLPostHandler: GraphQLPostHandler | null = null

const getGraphQLPostHandler = (
  config: Promise<SanitizedConfig> | SanitizedConfig,
): GraphQLPostHandler => {
  if (config === cachedHandlerConfig && cachedGraphQLPostHandler) {
    return cachedGraphQLPostHandler
  }
  const handler = GRAPHQL_POST(config as Promise<SanitizedConfig>)
  cachedHandlerConfig = config
  cachedGraphQLPostHandler = handler
  return handler
}

const resolveConfiguredGraphQLPathname = (config: SanitizedConfig): string => {
  const apiRoute = config.routes?.api || '/api'
  const graphQLRoute = config.routes?.graphQL || '/graphql'
  const joined = `${apiRoute.replace(/\/+$/, '')}/${graphQLRoute.replace(/^\/+/, '')}`
  return joined.startsWith('/') ? joined : `/${joined}`
}

const buildAnonymousGraphQLHeaders = (incomingHeaders?: Headers): Headers => {
  const sanitized = new Headers({
    Accept: 'application/graphql-response+json, application/json',
    'Content-Type': 'application/json',
  })
  if (incomingHeaders) {
    const origin = incomingHeaders.get('origin')
    if (origin) sanitized.set('Origin', origin)
    const acceptLanguage = incomingHeaders.get('accept-language')
    if (acceptLanguage) sanitized.set('Accept-Language', acceptLanguage)
  }
  return sanitized
}

const buildNoStoreJsonResponse = async (
  config: SanitizedConfig,
  incomingHeaders: Headers | undefined,
  status: number,
  payloadBody: unknown,
): Promise<Response> => {
  const baseHeaders = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  })

  const headers = incomingHeaders
    ? headersWithCors({
        headers: baseHeaders,
        req: {
          headers: incomingHeaders,
          payload: { config } as unknown as PayloadRequest['payload'],
        },
      })
    : baseHeaders

  return Response.json(payloadBody, { status, headers })
}

const ensureNoStoreOnResponse = (response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const isAcceptableJsonContentType = (contentType: string | null): boolean => {
  if (!contentType) return false
  const [rawMediaType, ...params] = contentType.split(';')
  if (rawMediaType?.trim().toLowerCase() !== 'application/json') return false
  for (const rawParam of params) {
    const trimmed = rawParam.trim()
    if (!trimmed) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) return false
    const paramName = trimmed.slice(0, eqIdx).trim().toLowerCase()
    const paramVal = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^"|"$/g, '')
      .toLowerCase()
    if (paramName === 'charset' && paramVal !== 'utf-8') {
      return false
    }
  }
  return true
}

export type PersistedDispatchOptions = {
  config?: Promise<SanitizedConfig> | SanitizedConfig
  graphQLPostHandler?: GraphQLPostHandler
}

/**
 * Handles an incoming HTTP request to `POST /api/fgql`:
 * - Rejects non-POST methods (`405`), URL query parameters (`400`), non-JSON media types (`415`),
 *   malformed JSON (`400`), batching, arbitrary queries, unknown IDs (`404`), and invalid variables (`400`).
 * - Strips `Cookie` and `Authorization` headers (retaining only `Origin` and `Accept-Language`).
 * - Rewrites the internal `Request` pathname to Payload's configured `/api/graphql` pathname so
 *   Payload 3.90.2's `createPayloadRequest` classifies the request as `isGraphQL: true` (`payloadAPI: 'GraphQL'`).
 * - Always stamps `Cache-Control: no-store`.
 */
export async function handlePersistedGraphQLHttpRequest(
  request: Request,
  options: PersistedDispatchOptions = {},
): Promise<Response> {
  const resolvedConfigSource = options.config ?? configPromise
  const config = await resolvedConfigSource

  if (request.method.toUpperCase() !== 'POST') {
    const headers = headersWithCors({
      headers: new Headers({
        Allow: 'POST',
        'Cache-Control': 'no-store',
        Vary: 'Origin',
      }),
      req: {
        headers: request.headers,
        payload: { config } as unknown as PayloadRequest['payload'],
      },
    })
    return new Response(null, { status: 405, headers })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(request.url)
  } catch {
    return buildNoStoreJsonResponse(config, request.headers, 400, {
      error: 'Invalid request URL.',
    })
  }

  if (parsedUrl.search.length > 0) {
    return buildNoStoreJsonResponse(config, request.headers, 400, {
      error: 'Persisted GraphQL URL query parameters are not supported.',
    })
  }

  if (!isAcceptableJsonContentType(request.headers.get('content-type'))) {
    return buildNoStoreJsonResponse(config, request.headers, 415, {
      error: 'Persisted GraphQL requests require Content-Type: application/json.',
    })
  }

  let rawBodyText: string
  try {
    rawBodyText = await request.text()
  } catch {
    return buildNoStoreJsonResponse(config, request.headers, 400, {
      error: 'Unable to read persisted GraphQL request body.',
    })
  }

  let decodedBody: unknown
  try {
    decodedBody = JSON.parse(rawBodyText)
  } catch {
    return buildNoStoreJsonResponse(config, request.headers, 400, {
      error: 'Malformed JSON in persisted GraphQL request body.',
    })
  }

  const validation = validatePersistedEnvelope(decodedBody)
  if (!validation.ok) {
    return buildNoStoreJsonResponse(config, request.headers, validation.status, {
      error: validation.error,
    })
  }

  const targetUrl = new URL(parsedUrl.origin)
  targetUrl.pathname = resolveConfiguredGraphQLPathname(config)

  const syntheticGraphQLRequest = new Request(targetUrl.toString(), {
    method: 'POST',
    headers: buildAnonymousGraphQLHeaders(request.headers),
    body: JSON.stringify({
      query: validation.entry.query,
      operationName: validation.entry.operationName,
      ...(validation.variables ? { variables: validation.variables } : {}),
    }),
    signal: request.signal,
  })

  const handler = options.graphQLPostHandler ?? getGraphQLPostHandler(resolvedConfigSource)
  const response = await handler(syntheticGraphQLRequest)
  return ensureNoStoreOnResponse(response)
}

export type ExecutePersistedQueryInput<TVariables extends ValidatedPersistedVariables = undefined> =
  TVariables extends undefined
    ? {
        id: PersistedQueryId
        variables?: undefined
        options?: PersistedDispatchOptions
      }
    : {
        id: PersistedQueryId
        variables: TVariables
        options?: PersistedDispatchOptions
      }

/**
 * Executes a registered persisted GraphQL operation in-process through Payload's real `GRAPHQL_POST`
 * handler with an anonymous request (`Cookie` and `Authorization` absent) targeted at `/api/graphql`.
 * Throws if validation fails, HTTP status is non-200, GraphQL `errors` are non-empty, or `data` is missing.
 */
export async function executePersistedQuery<TData = Record<string, unknown>>(
  id: PersistedQueryId,
  variables?: Record<string, string>,
  options: PersistedDispatchOptions = {},
): Promise<TData> {
  if (!Object.hasOwn(PERSISTED_QUERY_REGISTRY, id)) {
    throw new Error(`Unknown persisted GraphQL operation id "${String(id)}".`)
  }

  const envelope = variables ? { id, variables } : { id }
  const validation = validatePersistedEnvelope(envelope)
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const resolvedConfigSource = options.config ?? configPromise
  const config = await resolvedConfigSource
  const baseOrigin = config.serverURL || 'http://127.0.0.1:3000'
  const targetUrl = new URL(resolveConfiguredGraphQLPathname(config), baseOrigin)

  const syntheticRequest = new Request(targetUrl.toString(), {
    method: 'POST',
    headers: buildAnonymousGraphQLHeaders(),
    body: JSON.stringify({
      query: validation.entry.query,
      operationName: validation.entry.operationName,
      ...(validation.variables ? { variables: validation.variables } : {}),
    }),
  })

  const handler = options.graphQLPostHandler ?? getGraphQLPostHandler(resolvedConfigSource)
  const response = await handler(syntheticRequest)

  if (!response.ok) {
    throw new Error(`Persisted GraphQL operation "${id}" failed with HTTP ${response.status}.`)
  }

  const payloadJson = (await response.json()) as {
    data?: TData | null
    errors?: Array<{ message?: string }>
  }

  if (Array.isArray(payloadJson.errors) && payloadJson.errors.length > 0) {
    const firstMessage = payloadJson.errors[0]?.message || 'GraphQL execution error'
    throw new Error(`Persisted GraphQL operation "${id}" returned errors: ${firstMessage}`)
  }

  if (!payloadJson.data || typeof payloadJson.data !== 'object') {
    throw new Error(`Persisted GraphQL operation "${id}" returned no data object.`)
  }

  return payloadJson.data
}
