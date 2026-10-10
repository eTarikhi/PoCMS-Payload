/**
 * Slug helpers for article URLs (article page spec §3). Pure functions, with no Payload or Next imports,
 * so the collection hook, the backfill script, and the tests can all use them.
 */

export const ARTICLE_SLUG_MAX_LENGTH = 80
const FALLBACK_SLUG = 'article'

/**
 * Makes a URL-safe ASCII slug from a title. Turkish letters are folded to ASCII (ş→s, ğ→g, ı→i, İ→i,
 * ç→c, ö→o, ü→u), and anything else that is not a letter or digit becomes a hyphen. The result is at
 * most 80 characters, with no leading or trailing hyphen.
 */
export const slugify = (value: string): string => {
  const folded = value
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ARTICLE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')

  return folded.length > 0 ? folded : FALLBACK_SLUG
}

/**
 * Returns `base` if it is free, otherwise `base-2`, `base-3`, and so on. `isTaken` is asked about each
 * candidate in turn, so the first free one wins.
 */
export const withUniqueSuffix = async (
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> => {
  let candidate = base
  let suffix = 2
  while (await isTaken(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}
