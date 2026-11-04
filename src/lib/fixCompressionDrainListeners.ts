import type { EventEmitter } from 'node:events'
import http from 'node:http'
import { Duplex } from 'node:stream'

const PATCHED_SYMBOL = Symbol.for('pocms.serverResponseOnceDrainPatched')
const EARLY_CLOSE_PATCHED_SYMBOL = Symbol.for('pocms.earlyDestinationStreamCloseFiltered')
const EARLY_DESTINATION_STREAM_CLOSE_MSG = 'The destination stream closed early.'

type DrainListener = (...args: unknown[]) => void

interface PatchedPrototype extends http.ServerResponse {
  [PATCHED_SYMBOL]?: boolean
}

const compressionStreams = new WeakMap<http.ServerResponse, Duplex>()

/**
 * Fixes a Node.js `MaxListenersExceededWarning` ("11 drain listeners added to [Gzip]")
 * triggered by Next.js's built-in `compression` middleware (`next/dist/compiled/compression`)
 * combined with `pipeNodeReadableToNodeResponse` (`next/dist/server/pipe-readable`).
 *
 * Root cause:
 * - `compression` overrides `res.on` per response so `res.on('drain', fn)` attaches `fn`
 *   onto the underlying `zlib.Gzip` / `zlib.Deflate` stream, without overriding
 *   `res.once`, `res.off`, or `res.removeListener`.
 * - Node's `EventEmitter.prototype.once` wraps `fn` in `_onceWrap(res, 'drain', fn)` and
 *   calls `res.on('drain', wrapped)` (which attaches `wrapped` to `[Gzip]`). When `[Gzip]`
 *   emits `'drain'`, `_onceWrap` calls `res.removeListener('drain', wrapped)` on `res`
 *   instead of `[Gzip]`, leaving dead `_onceWrap` closures permanently attached to `[Gzip]`
 *   on every backpressure cycle (~16 KiB each).
 *
 * This idempotent patch teaches `ServerResponse.prototype.once` (and `off`/`removeListener`)
 * to detach `'drain'` listeners from the actual emitter (`[Gzip]` when compressed, `res`
 * otherwise) while preserving `ServerResponse` chaining and `releaseCompressionStream`.
 */
function createOnceDrainWrapper(
  res: http.ServerResponse,
  listener: DrainListener,
  origRemoveListener: typeof http.ServerResponse.prototype.removeListener,
): DrainListener & { listener?: DrainListener } {
  let fired = false
  const onceDrainWrapper: DrainListener & { listener?: DrainListener } = function (
    this: unknown,
    ...args: unknown[]
  ) {
    if (this && typeof (this as EventEmitter).removeListener === 'function') {
      ;(this as EventEmitter).removeListener('drain', onceDrainWrapper)
    }
    if (this !== res) {
      origRemoveListener.call(res, 'drain', onceDrainWrapper)
    }
    if (fired) return
    fired = true
    listener.apply(this, args)
  }
  onceDrainWrapper.listener = listener
  return onceDrainWrapper
}

export function installCompressionDrainFix(): boolean {
  const proto = http.ServerResponse?.prototype as PatchedPrototype | undefined
  if (!proto) return false
  if (proto[PATCHED_SYMBOL]) return false

  const origOnce = proto.once
  const origRemoveListener = proto.removeListener

  const patchedOnce = function (
    this: http.ServerResponse,
    event: string | symbol,
    listener: DrainListener,
  ): http.ServerResponse {
    if (
      event === 'drain' &&
      typeof listener === 'function' &&
      Object.prototype.hasOwnProperty.call(this, 'on')
    ) {
      const onceDrainWrapper = createOnceDrainWrapper(this, listener, origRemoveListener)
      const target: unknown = this.on('drain', onceDrainWrapper)
      if (target && target !== this && target instanceof Duplex) {
        compressionStreams.set(this, target)
      }
      return this
    }

    return origOnce.call(this, event, listener)
  }

  const patchedRemoveListener = function (
    this: http.ServerResponse,
    event: string | symbol,
    listener: DrainListener,
  ): http.ServerResponse {
    if (event === 'drain' && typeof listener === 'function') {
      const stream = compressionStreams.get(this)
      if (stream) {
        stream.removeListener('drain', listener)
      }
    }
    return origRemoveListener.call(this, event, listener)
  }

  proto.once = patchedOnce as typeof proto.once
  proto.removeListener = patchedRemoveListener as typeof proto.removeListener
  proto.off = patchedRemoveListener as typeof proto.off

  Object.defineProperty(proto, PATCHED_SYMBOL, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  })

  return true
}

export function isEarlyDestinationStreamCloseError(arg: unknown): boolean {
  if (typeof arg === 'string') {
    return arg.includes(EARLY_DESTINATION_STREAM_CLOSE_MSG)
  }
  if (!arg || typeof arg !== 'object') return false
  const err = arg as { message?: unknown; cause?: unknown }
  if (typeof err.message === 'string' && err.message.includes(EARLY_DESTINATION_STREAM_CLOSE_MSG)) {
    return true
  }
  if (err.cause && err.cause !== arg && isEarlyDestinationStreamCloseError(err.cause)) {
    return true
  }
  return false
}

/**
 * Suppresses Next.js 16.3.8's false-positive `console.error` log when a client closes an
 * in-flight React 19 Flight/Fizz `PassThrough` stream early (e.g. Chromium `Critical-CH`
 * client-hint handshake retry or SPA route transition cancellation). Next.js's own
 * `create-error-handler` intends to ignore closed-response aborts via `isAbortError()`,
 * which only checks `AbortError` / `ResponseAborted` and misses React 19's
 * `Error("The destination stream closed early.")`.
 */
export function installEarlyStreamCloseFilter(
  targetConsole: Pick<Console, 'error'> = console,
): boolean {
  const marked = targetConsole as Pick<Console, 'error'> & {
    [EARLY_CLOSE_PATCHED_SYMBOL]?: boolean
  }
  if (!marked || typeof marked.error !== 'function') return false
  if (marked[EARLY_CLOSE_PATCHED_SYMBOL]) return false

  const origError = marked.error.bind(marked)
  const filteredError: typeof console.error = (...args: unknown[]) => {
    if (args.some(isEarlyDestinationStreamCloseError)) {
      return
    }
    origError(...args)
  }

  marked.error = filteredError
  Object.defineProperty(marked, EARLY_CLOSE_PATCHED_SYMBOL, {
    value: true,
    enumerable: false,
    configurable: true,
    writable: false,
  })

  return true
}

