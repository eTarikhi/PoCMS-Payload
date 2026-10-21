/** Next image optimization is restricted to configured public HTTPS sources.
 * Additional sources must be origins, never arbitrary URL patterns or credentials.
 */
export function mediaRemotePatterns(configured = '') {
  const patterns: {
    protocol: 'https'
    hostname: string
    port: string
    pathname: string
    search: string
  }[] = [
    {
      protocol: 'https',
      hostname: '*.public.blob.vercel-storage.com',
      port: '',
      pathname: '/**',
      search: '',
    },
  ]
  const seen = new Set<string>()
  for (const entry of configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    let url: URL
    try {
      url = new URL(entry)
    } catch {
      throw new Error('Invalid MEDIA_REMOTE_ORIGINS: expected HTTPS origins.')
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[a-z0-9.-]+$/i.test(url.hostname) ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost') ||
      url.port
    ) {
      throw new Error(
        'Invalid MEDIA_REMOTE_ORIGINS: use public HTTPS origins without credentials, paths, ports, query strings, or fragments.',
      )
    }
    if (seen.has(url.hostname)) continue
    seen.add(url.hostname)
    patterns.push({
      protocol: 'https',
      hostname: url.hostname,
      port: '',
      pathname: '/**',
      search: '',
    })
  }
  return patterns
}
