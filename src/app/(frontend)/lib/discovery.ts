/** Public discovery routes. Only locally readable articles belong in the sitemap. */
export function publicSitemapEntries(site: string, slugs: string[]) {
  const origin = site.replace(/\/+$/, '')
  const staticPaths = ['/', '/blog', '/projects', '/articles']
  const articlePaths = [...new Set(slugs)]
    .filter(Boolean)
    .map((slug) => `/articles/${encodeURIComponent(slug)}`)
  return [...staticPaths, ...articlePaths].map((path) => ({ url: `${origin}${path}` }))
}
