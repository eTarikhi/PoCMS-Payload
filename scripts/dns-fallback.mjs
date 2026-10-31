/**
 * Resilient IPv4-first + fallback DNS resolver for CLI database tools (`db:migrate`, `db:optimize-indexes`).
 *
 * On Windows / VPN / dual-stack routers, Node.js v20–v24 `getaddrinfo` (`onlookupall`, `AF_UNSPEC`)
 * frequently fails with `EAI_AGAIN` when IPv6 (`AAAA`) queries time out or local router UDP DNS drops
 * CNAME chains (`*.aws.neon.tech`).
 *
 * Normal OS `dns.lookup` runs first with zero overhead; ONLY when OS `dns.lookup` fails with a
 * transient resolution error (`EAI_AGAIN`, `ETIMEOUT`, `ESERVFAIL`), this wrapper retries:
 *   1. OS `dns.lookup` forced to IPv4 (`family: 4`),
 *   2. Direct UDP/TCP DNS via `1.1.1.1` / `8.8.8.8` / `9.9.9.9`,
 *   3. DNS-over-HTTPS (`https://1.1.1.1/dns-query` & `https://8.8.8.8/resolve`) over literal IPv4:443.
 */
import dns from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'

const TRANSIENT_DNS_CODES = new Set(['EAI_AGAIN', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED'])

const PUBLIC_DNS_SERVERS = (process.env.DB_FALLBACK_DNS_SERVERS || '1.1.1.1,8.8.8.8,9.9.9.9')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const DOH_ENDPOINTS = ['https://1.1.1.1/dns-query', 'https://8.8.8.8/resolve']

/** @type {Map<string, { addresses: Array<{ address: string; family: 4 | 6 }>; expiresAt: number }>} */
const fallbackCache = new Map()

try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Ignore on runtimes without setDefaultResultOrder
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
  const now = Date.now()
  const cached = fallbackCache.get(hostname)
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
    fallbackCache.set(hostname, { addresses: osIpv4, expiresAt: now + 60_000 })
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
        fallbackCache.set(hostname, { addresses, expiresAt: now + 60_000 })
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
      fallbackCache.set(hostname, { addresses, expiresAt: now + 60_000 })
      return addresses
    }
  }

  return []
}

/**
 * Installs the fallback wrapper onto `node:dns` (idempotent).
 */
export function installDnsFallback() {
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
  try {
    syncBuiltinESMExports()
  } catch {
    // Ignore if unavailable
  }
}

installDnsFallback()
