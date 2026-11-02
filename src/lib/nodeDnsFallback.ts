import dns from 'node:dns'
import fs from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import path from 'node:path'

const TRANSIENT_DNS_CODES = new Set(['EAI_AGAIN', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED'])
const CACHE_TTL_MS = 300_000 // 5 minutes

const PUBLIC_DNS_SERVERS = (process.env.DB_FALLBACK_DNS_SERVERS || '1.1.1.1,8.8.8.8,9.9.9.9')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const DOH_ENDPOINTS = ['https://1.1.1.1/dns-query', 'https://8.8.8.8/resolve']

type ResolvedEntry = { address: string; family: 4 | 6 }

type SharedDnsCache = Map<string, { addresses: ResolvedEntry[]; expiresAt: number }>
const dnsShared = dns as typeof dns & { __pocmsFallbackCache?: SharedDnsCache }

const fallbackCache: SharedDnsCache =
  dnsShared.__pocmsFallbackCache ?? (dnsShared.__pocmsFallbackCache = new Map())

type DnsJsonResponse = {
  Status?: number
  Answer?: Array<{ type?: number; data?: string }>
}

export function loadDnsPrewarmEnv(raw: string | undefined = process.env.POCMS_DNS_PREWARM): void {
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
 * Patches `ws` `WebSocket.prototype.addEventListener` (and global `ErrorEvent.prototype`) so
 * `@neondatabase/serverless` never crashes with
 * `TypeError: Cannot set property message of #<ErrorEvent> which has only a getter` when
 * `connectionTimeoutMillis` or a WebSocket handshake error occurs on Node.js 20–24.
 */
export function installNeonWebSocketErrorEventFix(): void {
  try {
    if (typeof globalThis.ErrorEvent === 'function') {
      const proto = globalThis.ErrorEvent.prototype as unknown as Record<string, unknown>
      const desc = Object.getOwnPropertyDescriptor(proto, 'message')
      if (desc && typeof desc.get === 'function' && !desc.set && desc.configurable) {
        const origGet = desc.get
        Object.defineProperty(proto, 'message', {
          configurable: true,
          enumerable: desc.enumerable ?? true,
          get(this: Record<string, unknown>) {
            return Object.prototype.hasOwnProperty.call(this, '__pocmsMessageOverride')
              ? this.__pocmsMessageOverride
              : origGet.call(this)
          },
          set(this: Record<string, unknown>, val: unknown) {
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

  try {
    // Anchor `createRequire` via `fs.realpathSync` on `node_modules/@payloadcms/db-vercel-postgres/package.json`
    // instead of calling CommonJS `require.resolve` on the pure-ESM `@payloadcms/db-vercel-postgres` specifier,
    // which would trigger Next.js 16 Turbopack's `serverExternalPackages` warning in `pnpm dev`.
    const dbPkgJsonPath = fs.realpathSync(
      path.join(
        process.cwd(),
        'node_modules',
        '@payloadcms',
        'db-vercel-postgres',
        'package.json',
      ),
    )
    const dbReq = createRequire(dbPkgJsonPath)
    const vpPkgPath = dbReq.resolve('@vercel/postgres')
    const vpReq = createRequire(vpPkgPath)
    const WS = vpReq('ws') as {
      prototype?: {
        __pocmsErrorEventPatched?: boolean
        addEventListener?: (
          type: string,
          listener: (evt: unknown) => unknown,
          options?: unknown,
        ) => unknown
      }
    }

    if (WS?.prototype && !WS.prototype.__pocmsErrorEventPatched) {
      Object.defineProperty(WS.prototype, '__pocmsErrorEventPatched', {
        value: true,
        configurable: true,
        enumerable: false,
      })

      const origAddEventListener = WS.prototype.addEventListener
      if (typeof origAddEventListener === 'function') {
        WS.prototype.addEventListener = function patchedWsAddEventListener(
          this: unknown,
          type: string,
          listener: (evt: unknown) => unknown,
          options?: unknown,
        ) {
          if (type === 'error' && typeof listener === 'function') {
            const wrapped = function (this: unknown, evt: unknown) {
              if (evt && typeof evt === 'object' && !(evt instanceof Error)) {
                const evtRec = evt as { error?: unknown; message?: unknown }
                const inner = evtRec.error instanceof Error ? evtRec.error : null
                const msg =
                  (typeof evtRec.message === 'string' && evtRec.message) ||
                  inner?.message ||
                  'WebSocket connection error'
                const normalized: NodeJS.ErrnoException = new Error(msg)
                const innerCode = (inner as NodeJS.ErrnoException | null)?.code
                if (innerCode) {
                  normalized.code = innerCode
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
    // Ignore when optional packages are unavailable
  }
}

export async function resolveIPv4ViaDoH(
  hostname: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  for (const endpoint of DOH_ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4_000)
    try {
      const url = `${endpoint}?name=${encodeURIComponent(hostname)}&type=A`
      const res = await fetchImpl(url, {
        headers: { accept: 'application/dns-json' },
        signal: controller.signal,
      })
      if (!res.ok) continue
      const body = (await res.json()) as DnsJsonResponse
      if (body.Status === 3) {
        const nxErr: NodeJS.ErrnoException = new Error(`queryA ENOTFOUND ${hostname}`)
        nxErr.code = 'ENOTFOUND'
        throw nxErr
      }
      const ipv4s = (body.Answer ?? [])
        .filter(
          (ans): ans is { type: number; data: string } =>
            ans.type === 1 && typeof ans.data === 'string' && net.isIP(ans.data) === 4,
        )
        .map((ans) => ans.data)
      if (ipv4s.length > 0) return ipv4s
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOTFOUND') {
        throw err
      }
    } finally {
      clearTimeout(timer)
    }
  }
  return []
}

export type RawDnsLookupFn = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) => void

export async function fallbackResolveHost(
  hostname: string,
  origLookup: RawDnsLookupFn,
  options: {
    disablePublicUdp?: boolean
    fetchImpl?: typeof fetch
    bypassCache?: boolean
  } = {},
): Promise<ResolvedEntry[]> {
  const key = hostname.toLowerCase()
  const now = Date.now()
  if (!options.bypassCache) {
    const cached = fallbackCache.get(key)
    if (cached && cached.expiresAt > now) {
      return cached.addresses
    }
  }

  // Step 1: Retry OS lookup constrained strictly to IPv4 (`family: 4`) to bypass Windows dual-stack AAAA hangs
  const osIpv4 = await new Promise<ResolvedEntry[] | null>((resolve) => {
    origLookup(hostname, { family: 4, all: true }, (err, res) => {
      if (!err && Array.isArray(res) && res.length > 0) {
        resolve(res.map((r) => ({ address: r.address, family: 4 as const })))
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
  if (!options.disablePublicUdp && PUBLIC_DNS_SERVERS.length > 0) {
    try {
      const resolver = new dns.promises.Resolver({ timeout: 2_500, tries: 2 })
      resolver.setServers(PUBLIC_DNS_SERVERS)
      const v4 = await resolver.resolve4(hostname)
      if (v4.length > 0) {
        const addresses = v4.map((ip) => ({ address: ip, family: 4 as const }))
        fallbackCache.set(key, { addresses, expiresAt: now + CACHE_TTL_MS })
        return addresses
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOTFOUND') {
        throw err
      }
    }
  }

  // Step 3: Query DNS-over-HTTPS over literal IPv4:443 (works even when UDP 53 is blocked/intercepted)
  if (process.env.DB_DISABLE_DOH_FALLBACK !== 'true') {
    const dohV4 = await resolveIPv4ViaDoH(hostname, options.fetchImpl)
    if (dohV4.length > 0) {
      const addresses = dohV4.map((ip) => ({ address: ip, family: 4 as const }))
      fallbackCache.set(key, { addresses, expiresAt: now + CACHE_TTL_MS })
      return addresses
    }
  }

  return []
}

type PatchedDnsModule = typeof dns & { __pocmsFallbackInstalled?: boolean }

export function installNodeDnsFallback(): void {
  if (process.env.VERCEL === '1') return

  loadDnsPrewarmEnv()
  installNeonWebSocketErrorEventFix()

  if (process.env.DB_DISABLE_DNS_FALLBACK === 'true') return
  const dnsMod = dns as PatchedDnsModule
  if (dnsMod.__pocmsFallbackInstalled) return
  dnsMod.__pocmsFallbackInstalled = true

  try {
    dns.setDefaultResultOrder('ipv4first')
  } catch {
    // Ignore on unsupported runtimes
  }

  const origLookup = dns.lookup.bind(dns) as unknown as RawDnsLookupFn

  const patchedLookup = (
    hostname: string,
    optionsOrCb:
      | number
      | dns.LookupOptions
      | ((
          err: NodeJS.ErrnoException | null,
          address: string | dns.LookupAddress[],
          family?: number,
        ) => void),
    maybeCb?: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    let cb: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number,
    ) => void
    let opts: dns.LookupOptions

    if (typeof optionsOrCb === 'function') {
      cb = optionsOrCb
      opts = {}
    } else if (typeof optionsOrCb === 'number') {
      cb = maybeCb!
      opts = { family: optionsOrCb }
    } else {
      cb = maybeCb!
      opts = optionsOrCb ? { ...optionsOrCb } : {}
    }

    if (!hostname || net.isIP(hostname) !== 0 || hostname === 'localhost') {
      origLookup(hostname, opts, cb)
      return
    }

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

    origLookup(hostname, opts, (err, address, family) => {
      if (!err || !TRANSIENT_DNS_CODES.has(err.code ?? '')) {
        cb(err, address, family)
        return
      }

      fallbackResolveHost(hostname, origLookup)
        .then((resolved) => {
          if (resolved.length === 0) {
            cb(err, '')
            return
          }
          if (opts.all) {
            cb(null, resolved)
            return
          }
          cb(null, resolved[0].address, resolved[0].family)
        })
        .catch((fallbackErr: unknown) => {
          const typed = fallbackErr as NodeJS.ErrnoException
          cb(typed?.code === 'ENOTFOUND' ? typed : err, '')
        })
    })
  }

  ;(dns as unknown as { lookup: typeof patchedLookup }).lookup = patchedLookup
  if (dns.promises && typeof dns.promises.lookup === 'function') {
    const patchedPromisesLookup = (
      hostname: string,
      options?: number | dns.LookupOptions,
    ): Promise<dns.LookupAddress | dns.LookupAddress[]> =>
      new Promise((resolve, reject) => {
        const isAll = typeof options === 'object' && options !== null && Boolean(options.all)
        patchedLookup(hostname, options ?? {}, (err, address, family) => {
          if (err) {
            reject(err)
            return
          }
          if (isAll) {
            resolve(address as dns.LookupAddress[])
          } else {
            resolve({ address: address as string, family: family ?? 4 })
          }
        })
      })
    ;(dns.promises as unknown as { lookup: typeof patchedPromisesLookup }).lookup =
      patchedPromisesLookup
  }
  try {
    syncBuiltinESMExports()
  } catch {
    // Ignore if unavailable
  }
}
