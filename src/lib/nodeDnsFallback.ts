import dns from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'

const TRANSIENT_DNS_CODES = new Set(['EAI_AGAIN', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED'])

const PUBLIC_DNS_SERVERS = (process.env.DB_FALLBACK_DNS_SERVERS || '1.1.1.1,8.8.8.8,9.9.9.9')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const DOH_ENDPOINTS = ['https://1.1.1.1/dns-query', 'https://8.8.8.8/resolve']

type ResolvedEntry = { address: string; family: 4 | 6 }

const fallbackCache = new Map<string, { addresses: ResolvedEntry[]; expiresAt: number }>()

type DnsJsonResponse = {
  Status?: number
  Answer?: Array<{ type?: number; data?: string }>
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
  const now = Date.now()
  if (!options.bypassCache) {
    const cached = fallbackCache.get(hostname)
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
    fallbackCache.set(hostname, { addresses: osIpv4, expiresAt: now + 60_000 })
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
        fallbackCache.set(hostname, { addresses, expiresAt: now + 60_000 })
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
      fallbackCache.set(hostname, { addresses, expiresAt: now + 60_000 })
      return addresses
    }
  }

  return []
}

type PatchedDnsModule = typeof dns & { __pocmsFallbackInstalled?: boolean }

export function installNodeDnsFallback(): void {
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
  try {
    syncBuiltinESMExports()
  } catch {
    // Ignore if unavailable
  }
}
