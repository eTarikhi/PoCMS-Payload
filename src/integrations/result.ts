/**
 * Results of calls to external services (Vercel, Google, GitHub). Widgets and pages render each
 * state: a missing token is a setup hint, not an error, and a failing service never breaks the
 * admin.
 */
export type IntegrationResult<T> =
  { status: 'ok'; data: T } | { status: 'not-configured'; missing: string[] } | IntegrationFailure

/** A failed call. `action` links to where an administrator fixes it (enable an API, edit a key). */
export type IntegrationFailure = {
  status: 'error'
  message: string
  action?: { label: string; href: string }
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** The parsed error answer, for services whose errors carry a machine-readable reason. */
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'IntegrationError'
  }
}

/** Environment variables from `names` that are empty or unset. */
export const missingEnv = (...names: string[]): string[] =>
  names.filter((name) => !process.env[name]?.trim())

type FetchJSONOptions = {
  body?: unknown
  headers?: Record<string, string>
  method?: 'GET' | 'POST'
  /** Seconds Next.js may serve a cached answer (fetch data cache). 0 disables caching. */
  revalidate?: number
  timeoutMs?: number
}

/**
 * fetch + JSON with a timeout and a readable error (the service's own message when it sends one).
 * Tokens travel in headers only, so URLs and errors never contain them.
 */
export async function fetchJSON<T>(url: string, options: FetchJSONOptions = {}): Promise<T> {
  const { body, headers, method = 'GET', revalidate = 300, timeoutMs = 10_000 } = options
  let response: Response
  try {
    response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      method,
      signal: AbortSignal.timeout(timeoutMs),
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' as const }),
    })
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `no answer within ${timeoutMs / 1000} s`
        : error instanceof Error
          ? error.message
          : String(error)
    throw new IntegrationError(`${new URL(url).hostname}: ${reason}`)
  }
  const text = await response.text()
  let json: unknown = undefined
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    // Not JSON (an HTML error page, for example); reported below.
  }
  if (!response.ok) {
    const detail =
      (json as { error?: { message?: string } | string; message?: string } | undefined) ?? {}
    const message =
      (typeof detail.error === 'object' ? detail.error?.message : detail.error) ??
      detail.message ??
      response.statusText
    throw new IntegrationError(
      `${new URL(url).hostname} answered ${response.status}${message ? `: ${message}` : ''}`,
      response.status,
      json,
    )
  }
  if (json === undefined) throw new IntegrationError(`${new URL(url).hostname}: empty answer`)
  return json as T
}

/** Runs `load`, turning thrown errors into an `error` result. */
export async function settle<T>(load: () => Promise<T>): Promise<IntegrationResult<T>> {
  try {
    return { status: 'ok', data: await load() }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
