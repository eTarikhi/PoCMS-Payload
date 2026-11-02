/**
 * Resilient IPv4-first + fallback DNS resolver and Neon WebSocket `ErrorEvent` shim for CLI tools.
 *
 * 1. DNS resilience:
 *    On Windows / VPN / dual-stack routers, Node.js v20–v24 `getaddrinfo` (`AF_UNSPEC`) frequently
 *    fails with `EAI_AGAIN` when IPv6 (`AAAA`) queries time out or local router UDP DNS drops CNAME
 *    chains (`*.aws.neon.tech`). Once a hostname resolves via fallback (or is prewarmed via
 *    `POCMS_DNS_PREWARM`), `dns.lookup` serves the cached IPv4 address immediately without
 *    re-hanging on broken OS `getaddrinfo` on every subsequent socket checkout.
 *
 * 2. `@neondatabase/serverless` + `ws` + Node 24 `ErrorEvent` crash fix:
 *    `@neondatabase/serverless@0.9.5` mutates `o.message = "Connection terminated due to connection timeout"`
 *    inside `Client._connectionCallback`, where `o` is a `ws` `ErrorEvent` whose `.message` property
 *    has only a getter and no setter — throwing an uncaught `TypeError` that crashes the process.
 *    `installNeonWebSocketErrorEventFix()` normalizes `ws` `'error'` events to standard `Error`
 *    instances with writable `.message`.
 */
import dns from 'node:dns'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import net from 'node:net'

const TRANSIENT_DNS_CODES = new Set(['EAI_AGAIN', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED'])
const CACHE_TTL_MS = 300_000 // 5 minutes

const PUBLIC_DNS_SERVERS = (process.env.DB_FALLBACK_DNS_SERVERS || '1.1.1.1,8.8.8.8,9.9.9.9')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const DOH_ENDPOINTS = ['https://1.1.1.1/dns-query', 'https://8.8.8.8/resolve']

/** @type {typeof dns & { __pocmsFallbackCache?: Map<string, { addresses: Array<{ address: string; family: 4 | 6 }>; expiresAt: number }> }} */
const dnsShared = dns

/** @type {Map<string, { addresses: Array<{ address: string; family: 4 | 6 }>; expiresAt: number }>} */
const fallbackCache = dnsShared.__pocmsFallbackCache ?? (dnsShared.__pocmsFallbackCache = new Map())

try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Ignore on runtimes without setDefaultResultOrder
}

/**
 * Loads pre-resolved `host=ipv4` pairs passed from a parent CLI process via `POCMS_DNS_PREWARM`.
 * @param {string | undefined} raw
 */
export function loadDnsPrewarmEnv(raw = process.env.POCMS_DNS_PREWARM) {
  if (!raw) return
  const expiresAt = Date.now() + CACHE_TTL_MS
  for (const token of raw.split(',')) {
    const eq = token.indexOf('=')
    if (eq <= 0) continue
    const host = token.slice(0, eq).trim().toLowerCase()
    const ip = token.slice(eq + 1).trim()
    if (host && net.isIP(ip) === 4) {
      fallbackCache.set(host, {
        addresses: [{ address: ip, family: 4 }],
        expiresAt,
      })
    }
  }
}

/**
 * Serializes active cached IPv4 lookups as `host=ip,host2=ip2` for child-process `POCMS_DNS_PREWARM`.
 * @returns {string}
 */
export function exportDnsPrewarmString() {
  const now = Date.now()
  /** @type {string[]} */
  const pairs = []
  for (const [host, entry] of fallbackCache.entries()) {
    if (entry.expiresAt > now && entry.addresses[0]?.family === 4) {
      pairs.push(`${host}=${entry.addresses[0].address}`)
    }
  }
  return pairs.join(',')
}

/**
 * Seeds a verified IPv4 address for `hostname` into the fast-path cache.
 * @param {string} hostname
 * @param {string} ipv4
 */
export function seedDnsCacheEntry(hostname, ipv4) {
  if (!hostname || net.isIP(ipv4) !== 4) return
  fallbackCache.set(hostname.trim().toLowerCase(), {
    addresses: [{ address: ipv4, family: 4 }],
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

/**
 * Patches `ws` `WebSocket.prototype.addEventListener` (and global `ErrorEvent.prototype`) so
 * `@neondatabase/serverless` never crashes with
 * `TypeError: Cannot set property message of #<ErrorEvent> which has only a getter`.
 */
export function installNeonWebSocketErrorEventFix() {
  // 1. Make global DOM `ErrorEvent.prototype.message` writable if getter-only (Node 20-24 Undici)
  try {
    if (typeof globalThis.ErrorEvent === 'function') {
      const proto = globalThis.ErrorEvent.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'message')
      if (desc && typeof desc.get === 'function' && !desc.set && desc.configurable) {
        const origGet = desc.get
        Object.defineProperty(proto, 'message', {
          configurable: true,
          enumerable: desc.enumerable ?? true,
          get() {
            return Object.prototype.hasOwnProperty.call(this, '__pocmsMessageOverride')
              ? this.__pocmsMessageOverride
              : origGet.call(this)
          },
          set(val) {
            Object.defineProperty(this, '__pocmsMessageOverride', {
              value: String(val),
              writable: true,
              configurable: true,
              enumerable: false,
            })
          },
        })
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. Patch `ws` (used by `@vercel/postgres` -> `@neondatabase/serverless`) so `'error'` listeners
  // receive a real `Error` instance with writable `.message` instead of a getter-only `ErrorEvent`.
  try {
    const rootReq = createRequire(import.meta.url)
    const dbPkgPath = rootReq.resolve('@payloadcms/db-vercel-postgres')
    const dbReq = createRequire(dbPkgPath)
    const vpPkgPath = dbReq.resolve('@vercel/postgres')
    const vpReq = createRequire(vpPkgPath)
    const WS = vpReq('ws')

    if (WS?.prototype && !WS.prototype.__pocmsErrorEventPatched) {
      Object.defineProperty(WS.prototype, '__pocmsErrorEventPatched', {
        value: true,
        configurable: true,
        enumerable: false,
      })

      const origAddEventListener = WS.prototype.addEventListener
      if (typeof origAddEventListener === 'function') {
        WS.prototype.addEventListener = function patchedWsAddEventListener(type, listener, options) {
          if (type === 'error' && typeof listener === 'function') {
            /** @param {any} evt */
            const wrapped = function (evt) {
              if (evt && typeof evt === 'object' && !(evt instanceof Error)) {
                const inner = evt.error instanceof Error ? evt.error : null
                const msg =
                  (typeof evt.message === 'string' && evt.message) ||
                  inner?.message ||
                  'WebSocket connection error'
                const normalized = /** @type {NodeJS.ErrnoException} */ (new Error(msg))
                if (inner && 'code' in inner && inner.code) {
                  normalized.code = /** @type {string} */ (inner.code)
                }
                if (inner) {
                  normalized.cause = inner
                }
                return listener.call(this, normalized)
              }
              return listener.call(this, evt)
            }
            return origAddEventListener.call(this, type, wrapped, options)
          }
          return origAddEventListener.call(this, type, listener, options)
        }
      }
    }
  } catch {
    // Ignore if optional packages are absent
  }
}

/**
 * Resolves A records over DNS-over-HTTPS using literal IP endpoints (no DNS bootstrap needed).
 * @param {string} hostname
 * @returns {Promise<string[]>}
 */
export async function resolveIPv4ViaDoH(hostname) {
  for (const endpoint of DOH_ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4_000)
    try {
      const url = `${endpoint}?name=${encodeURIComponent(hostname)}&type=A`
      const res = await fetch(url, {
        headers: { accept: 'application/dns-json' },
        signal: controller.signal,
      })
      if (!res.ok) continue
      const body = /** @type {{ Status?: number; Answer?: Array<{ type?: number; data?: string }> }} */ (
        await res.json()
      )
      if (body.Status === 3) {
        const nxErr = /** @type {NodeJS.ErrnoException} */ (
          new Error(`queryA ENOTFOUND ${hostname}`)
        )
        nxErr.code = 'ENOTFOUND'
        throw nxErr
      }
      const ipv4s = (body.Answer || [])
        .filter((ans) => ans.type === 1 && typeof ans.data === 'string' && net.isIP(ans.data) === 4)
        .map((ans) => /** @type {string} */ (ans.data))
      if (ipv4s.length > 0) return ipv4s
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err)?.code === 'ENOTFOUND') {
        throw err
      }
    } finally {
      clearTimeout(timer)
    }
  }
  return []
}

/**
 * Resolves `hostname` via public DNS resolvers / DoH when OS `getaddrinfo` returns `EAI_AGAIN`.
 * @param {string} hostname
 * @param {(host: string, opts: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => void} origLookup
 * @returns {Promise<Array<{ address: string; family: 4 | 6 }>>}
 */
export async function fallbackResolveHost(hostname, origLookup) {
  const key = hostname.toLowerCase()
  const now = Date.now()
  const cached = fallbackCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.addresses
  }

  // Step 1: Retry OS lookup constrained strictly to IPv4 (`family: 4`) to bypass dual-stack AAAA hangs
  const osIpv4 = await new Promise((resolve) => {
    origLookup(hostname, { family: 4, all: true }, (err, res) => {
      if (!err && Array.isArray(res) && res.length > 0) {
        resolve(res.map((r) => ({ address: r.address, family: /** @type {4} */ (4) })))
      } else {
        resolve(null)
      }
    })
  })
  if (osIpv4) {
    fallbackCache.set(key, { addresses: osIpv4, expiresAt: now + CACHE_TTL_MS })
    return osIpv4
  }

  // Step 2: Query public DNS servers directly via UDP/TCP port 53
  if (PUBLIC_DNS_SERVERS.length > 0) {
    try {
      const resolver = new dns.promises.Resolver({ timeout: 2_500, tries: 2 })
      resolver.setServers(PUBLIC_DNS_SERVERS)
      const v4 = await resolver.resolve4(hostname)
      if (v4.length > 0) {
        const addresses = v4.map((ip) => ({ address: ip, family: /** @type {4} */ (4) }))
        fallbackCache.set(key, { addresses, expiresAt: now + CACHE_TTL_MS })
        return addresses
      }
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err)?.code === 'ENOTFOUND') {
        throw err
      }
    }
  }

  // Step 3: Query DNS-over-HTTPS over literal IPv4:443 (works even when UDP 53 is blocked/intercepted)
  if (process.env.DB_DISABLE_DOH_FALLBACK !== 'true') {
    const dohV4 = await resolveIPv4ViaDoH(hostname)
    if (dohV4.length > 0) {
      const addresses = dohV4.map((ip) => ({ address: ip, family: /** @type {4} */ (4) }))
      fallbackCache.set(key, { addresses, expiresAt: now + CACHE_TTL_MS })
      return addresses
    }
  }

  return []
}

/**
 * Installs the fallback wrapper onto `node:dns` and the Neon WebSocket `ErrorEvent` fix (idempotent).
 */
export function installDnsFallback() {
  loadDnsPrewarmEnv()
  installNeonWebSocketErrorEventFix()

  const dnsAny = /** @type {typeof dns & { __pocmsFallbackInstalled?: boolean }} */ (dns)
  if (dnsAny.__pocmsFallbackInstalled) return
  dnsAny.__pocmsFallbackInstalled = true

  const origLookup = dns.lookup.bind(dns)

  /**
   * @param {string} hostname
   * @param {number | dns.LookupOptions | ((err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void)} options
   * @param {((err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void)} [callback]
   */
  const patchedLookup = (hostname, options, callback) => {
    /** @type {(err: NodeJS.ErrnoException | null, address: any, family?: number) => void} */
    let cb
    /** @type {dns.LookupOptions} */
    let opts

    if (typeof options === 'function') {
      cb = options
      opts = {}
    } else if (typeof options === 'number') {
      cb = /** @type {any} */ (callback)
      opts = { family: options }
    } else {
      cb = /** @type {any} */ (callback)
      opts = options ? { ...options } : {}
    }

    if (!hostname || net.isIP(hostname) !== 0 || hostname === 'localhost') {
      return origLookup(hostname, opts, cb)
    }

    // Fast-path: if this hostname previously required fallback (or was prewarmed from parent CLI),
    // serve the verified IPv4 entry immediately without re-waiting on broken OS `getaddrinfo`.
    if (opts.family !== 6) {
      const cached = fallbackCache.get(hostname.toLowerCase())
      if (cached && cached.expiresAt > Date.now() && cached.addresses.length > 0) {
        process.nextTick(() => {
          if (opts.all) {
            cb(null, cached.addresses)
          } else {
            cb(null, cached.addresses[0].address, cached.addresses[0].family)
          }
        })
        return
      }
    }

    return origLookup(hostname, opts, (err, address, family) => {
      if (!err || !TRANSIENT_DNS_CODES.has(err.code || '')) {
        return cb(err, address, family)
      }

      fallbackResolveHost(hostname, origLookup)
        .then((resolved) => {
          if (!resolved || resolved.length === 0) {
            return cb(err)
          }
          if (opts.all) {
            return cb(null, resolved)
          }
          return cb(null, resolved[0].address, resolved[0].family)
        })
        .catch((fallbackErr) => {
          cb(fallbackErr?.code === 'ENOTFOUND' ? fallbackErr : err)
        })
    })
  }

  dns.lookup = /** @type {typeof dns.lookup} */ (patchedLookup)
  if (dns.promises && typeof dns.promises.lookup === 'function') {
    /**
     * @param {string} hostname
     * @param {number | dns.LookupOptions} [options]
     */
    const patchedPromisesLookup = (hostname, options) =>
      new Promise((resolve, reject) => {
        const isAll = typeof options === 'object' && options !== null && Boolean(options.all)
        patchedLookup(hostname, options ?? {}, (err, address, family) => {
          if (err) {
            reject(err)
            return
          }
          if (isAll) {
            resolve(address)
          } else {
            resolve({ address, family })
          }
        })
      })
    dns.promises.lookup = /** @type {typeof dns.promises.lookup} */ (patchedPromisesLookup)
  }
  try {
    syncBuiltinESMExports()
  } catch {
    // Ignore if unavailable
  }
}

installDnsFallback()
