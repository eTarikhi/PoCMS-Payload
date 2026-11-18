import { headersWithCors, type PayloadRequest, type SanitizedConfig } from 'payload'

export const MAX_GRAPHQL_REQUEST_BODY_BYTES = 1_048_576

type RouteHandler = (request: Request) => Promise<Response>

type ReadRequestBodyResult =
  { body: Uint8Array | null; exceededLimit: false } | { body: null; exceededLimit: true }

/** Read at most the configured limit into a bounded, geometrically grown buffer. */
async function readRequestBody(request: Request): Promise<ReadRequestBodyResult> {
  if (!request.body) return { body: null, exceededLimit: false }

  const reader = request.body.getReader()
  let buffer = new Uint8Array(0)
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength === 0) continue

      if (value.byteLength > MAX_GRAPHQL_REQUEST_BODY_BYTES - totalBytes) {
        // Stop consuming as soon as actual stream bytes exceed the limit. Do not wait for a
        // client-controlled stream's cancellation promise before returning the 413 response.
        void reader.cancel().catch(() => undefined)
        return { body: null, exceededLimit: true }
      }

      const nextTotalBytes = totalBytes + value.byteLength
      if (nextTotalBytes > buffer.byteLength) {
        const nextCapacity = Math.min(
          MAX_GRAPHQL_REQUEST_BODY_BYTES,
          Math.max(nextTotalBytes, buffer.byteLength ? buffer.byteLength * 2 : 1024),
        )
        const expandedBuffer = new Uint8Array(nextCapacity)
        expandedBuffer.set(buffer)
        buffer = expandedBuffer
      }

      buffer.set(value, totalBytes)
      totalBytes = nextTotalBytes
    }
  } finally {
    reader.releaseLock()
  }

  return { body: buffer.subarray(0, totalBytes), exceededLimit: false }
}

/**
 * Enforce the GraphQL POST body limit using observed stream bytes, then replay the bounded body
 * for Payload's existing request-clone and GraphQL JSON parsing flow.
 */
export function withGraphQLRequestBodyLimit(
  config: Promise<SanitizedConfig> | SanitizedConfig,
  handler: RouteHandler,
): RouteHandler {
  const configPromise = Promise.resolve(config)

  return async (request) => {
    const { body, exceededLimit } = await readRequestBody(request)

    if (exceededLimit) {
      const resolvedConfig = await configPromise
      const headers = headersWithCors({
        headers: new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' }),
        // headersWithCors only needs the config's CORS options and the original request headers.
        req: {
          headers: request.headers,
          payload: { config: resolvedConfig } as unknown as PayloadRequest['payload'],
        },
      })

      return Response.json(
        {
          error: `GraphQL request body exceeds the ${MAX_GRAPHQL_REQUEST_BODY_BYTES}-byte limit.`,
        },
        { headers, status: 413 },
      )
    }

    if (body === null) return handler(request)

    // `request.body` has been consumed by the bounded reader. Supplying a replacement body lets
    // Request copy the URL, method, headers, and signal without teeing or losing the original bytes.
    return handler(new Request(request, { body }))
  }
}
