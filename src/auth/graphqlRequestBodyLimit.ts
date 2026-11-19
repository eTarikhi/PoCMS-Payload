import { headersWithCors, type PayloadRequest, type SanitizedConfig } from 'payload'

export const MAX_GRAPHQL_REQUEST_BODY_BYTES = 1_048_576
/** Absolute wall-clock deadline for reading the complete authenticated GraphQL request body. */
export const GRAPHQL_REQUEST_BODY_DEADLINE_MS = 15_000

type RouteHandler = (request: Request) => Promise<Response>

type BodyReadResult =
  | { kind: 'complete'; body: Uint8Array | null }
  | { kind: 'too-large' }
  | { kind: 'deadline' }
  | { kind: 'aborted' }
  | { kind: 'read-error' }

type SettledRead =
  { kind: 'read'; result: ReadableStreamReadResult<Uint8Array> } | { kind: 'error'; error: unknown }

type BodyInterrupt = 'deadline' | 'aborted'

const isAbortError = (error: unknown): boolean => {
  try {
    return Boolean(
      error && typeof error === 'object' && 'name' in error && error.name === 'AbortError',
    )
  } catch {
    return false
  }
}

/** Cancel a reader without waiting for a client-controlled stream's cancel algorithm to settle. */
const cancelReader = (reader: ReadableStreamDefaultReader<Uint8Array>, reason: unknown): void => {
  try {
    void reader.cancel(reason).catch(() => undefined)
  } catch {
    // A stream can already be errored or cancelled when the request aborts.
  }
}

/** Read at most the configured limit into a bounded, geometrically grown buffer. */
async function readRequestBody(request: Request): Promise<BodyReadResult> {
  if (!request.body) {
    return request.signal.aborted ? { kind: 'aborted' } : { kind: 'complete', body: null }
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = request.body.getReader()
  } catch {
    return { kind: 'read-error' }
  }

  let buffer = new Uint8Array(0)
  let totalBytes = 0
  let timeout: ReturnType<typeof setTimeout> | undefined
  let releaseAfterPendingRead = false
  let readerReleased = false
  let interruption: BodyInterrupt | null = null
  let resolveInterruption: (reason: BodyInterrupt) => void = () => undefined
  const interruptionPromise = new Promise<BodyInterrupt>((resolve) => {
    resolveInterruption = resolve
  })
  const onAbort = (): void => {
    if (interruption === null) {
      interruption = 'aborted'
      resolveInterruption('aborted')
    }
  }
  const interruptForDeadline = (): void => {
    if (interruption === null) {
      interruption = 'deadline'
      resolveInterruption('deadline')
    }
  }
  const releaseReader = (): void => {
    if (readerReleased) return
    readerReleased = true
    try {
      reader.releaseLock()
    } catch {
      // Avoid reclassifying a cancelled or already released client stream as a server error.
    }
  }

  if (request.signal.aborted) {
    cancelReader(reader, 'aborted')
    releaseReader()
    return { kind: 'aborted' }
  }

  try {
    request.signal.addEventListener('abort', onAbort, { once: true })
    if (request.signal.aborted) onAbort()
    if (interruption === null) {
      timeout = setTimeout(interruptForDeadline, GRAPHQL_REQUEST_BODY_DEADLINE_MS)
    }

    while (true) {
      if (interruption !== null) {
        cancelReader(reader, interruption)
        return { kind: interruption }
      }

      let readPromise: Promise<SettledRead>
      try {
        readPromise = reader.read().then<SettledRead, SettledRead>(
          (result) => ({ kind: 'read', result }),
          (error: unknown) => ({ kind: 'error', error }),
        )
      } catch (error) {
        cancelReader(reader, error)
        return isAbortError(error) || request.signal.aborted
          ? { kind: 'aborted' }
          : { kind: 'read-error' }
      }

      const outcome = await Promise.race([
        readPromise,
        interruptionPromise.then(
          (reason): SettledRead | { kind: 'interrupt'; reason: BodyInterrupt } => ({
            kind: 'interrupt',
            reason,
          }),
        ),
      ])

      if (outcome.kind === 'interrupt') {
        cancelReader(reader, outcome.reason)
        releaseAfterPendingRead = true
        void readPromise.then(releaseReader)
        return { kind: outcome.reason }
      }

      if (interruption !== null) {
        cancelReader(reader, interruption)
        return { kind: interruption }
      }

      if (outcome.kind === 'error') {
        cancelReader(reader, outcome.error)
        return isAbortError(outcome.error) || request.signal.aborted
          ? { kind: 'aborted' }
          : { kind: 'read-error' }
      }

      if (request.signal.aborted) {
        cancelReader(reader, 'aborted')
        return { kind: 'aborted' }
      }

      const { done, value } = outcome.result
      if (done) break
      if (!value || !(value instanceof Uint8Array)) {
        cancelReader(reader, 'invalid request body chunk')
        return { kind: 'read-error' }
      }
      if (value.byteLength === 0) continue

      if (value.byteLength > MAX_GRAPHQL_REQUEST_BODY_BYTES - totalBytes) {
        // Stop consuming as soon as actual stream bytes exceed the limit. Do not wait for a
        // client-controlled stream's cancellation promise before returning the 413 response.
        cancelReader(reader, 'request body exceeds the configured limit')
        return { kind: 'too-large' }
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
    if (timeout !== undefined) clearTimeout(timeout)
    request.signal.removeEventListener('abort', onAbort)
    if (!releaseAfterPendingRead) releaseReader()
  }

  return { kind: 'complete', body: buffer.subarray(0, totalBytes) }
}

const bodyLimitErrorResponse = async (
  configPromise: Promise<SanitizedConfig>,
  request: Request,
  status: 400 | 408 | 413,
  message: string,
): Promise<Response> => {
  const config = await configPromise
  const headers = headersWithCors({
    headers: new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' }),
    // headersWithCors only needs the config's CORS options and the original request headers.
    req: {
      headers: request.headers,
      payload: { config } as unknown as PayloadRequest['payload'],
    },
  })

  return Response.json({ error: message }, { headers, status })
}

/**
 * Enforce an actual-byte limit and absolute upload deadline before replaying the bounded body for
 * Payload's existing request-clone and GraphQL JSON parsing flow.
 */
export function withGraphQLRequestBodyLimit(
  config: Promise<SanitizedConfig> | SanitizedConfig,
  handler: RouteHandler,
): RouteHandler {
  const configPromise = Promise.resolve(config)

  return async (request) => {
    const result = await readRequestBody(request)

    if (result.kind === 'too-large') {
      return bodyLimitErrorResponse(
        configPromise,
        request,
        413,
        `GraphQL request body exceeds the ${MAX_GRAPHQL_REQUEST_BODY_BYTES}-byte limit.`,
      )
    }

    if (result.kind === 'deadline') {
      return bodyLimitErrorResponse(
        configPromise,
        request,
        408,
        `GraphQL request body exceeded its ${GRAPHQL_REQUEST_BODY_DEADLINE_MS}-millisecond deadline.`,
      )
    }

    if (result.kind === 'aborted') {
      return bodyLimitErrorResponse(
        configPromise,
        request,
        408,
        'GraphQL request body was interrupted.',
      )
    }

    if (result.kind === 'read-error') {
      return bodyLimitErrorResponse(
        configPromise,
        request,
        400,
        'Unable to read GraphQL request body.',
      )
    }

    if (request.signal.aborted) {
      return bodyLimitErrorResponse(
        configPromise,
        request,
        408,
        'GraphQL request body was interrupted.',
      )
    }

    if (result.body === null) return handler(request)

    // `request.body` has been consumed by the bounded reader. Supplying a replacement body lets
    // Request copy the URL, method, headers, and signal without teeing or losing the original bytes.
    return handler(new Request(request, { body: result.body }))
  }
}
