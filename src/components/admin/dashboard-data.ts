import type { Payload, TypedUser } from 'payload'

export const contentTypes = [
  { slug: 'projects', label: 'Projects', description: 'Portfolio work' },
  { slug: 'articles', label: 'Articles', description: 'Writing and insights' },
  { slug: 'media', label: 'Media', description: 'Images and files' },
  { slug: 'services', label: 'Services', description: 'What you offer' },
] as const

export type ContentSlug = (typeof contentTypes)[number]['slug']
type Overview = { slug: ContentSlug; count: number | null }
type RecentItem = {
  id: number | string
  label: string
  slug: 'projects' | 'articles'
  updatedAt: string
}

export async function loadOverview(
  payload: Payload,
  user: TypedUser,
  readableSlugs: readonly ContentSlug[],
): Promise<{ overview: Overview[]; recent: RecentItem[] }> {
  const results = await Promise.all(
    readableSlugs.map(async (slug): Promise<{ overview: Overview; recent: RecentItem[] }> => {
      try {
        // Local API bypasses access control unless both the user and overrideAccess are set.
        const result = await payload.find({
          collection: slug,
          user,
          overrideAccess: false,
          depth: 0,
          limit: slug === 'projects' || slug === 'articles' ? 4 : 1,
          select:
            slug === 'projects' || slug === 'articles'
              ? { title: true, updatedAt: true }
              : { updatedAt: true },
          sort: '-updatedAt',
        })

        return {
          overview: { slug, count: result.totalDocs },
          recent:
            slug === 'projects' || slug === 'articles'
              ? result.docs.map((doc) => ({
                  id: doc.id,
                  slug,
                  label:
                    ('title' in doc && typeof doc.title === 'string' && doc.title) || 'Untitled',
                  updatedAt: doc.updatedAt,
                }))
              : [],
        }
      } catch {
        // A failed query is not the same thing as an empty collection.
        return { overview: { slug, count: null }, recent: [] }
      }
    }),
  )

  return {
    overview: results.map((result) => result.overview),
    recent: results
      .flatMap((result) => result.recent)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 5),
  }
}
