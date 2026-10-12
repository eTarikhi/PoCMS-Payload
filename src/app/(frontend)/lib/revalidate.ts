import { revalidateTag } from 'next/cache'

/** Cache tag shared by every portfolio query in `cache.ts`. */
export const PORTFOLIO_CACHE_TAG = 'portfolio'

/**
 * Marks the cached home-page content as stale.
 *
 * Called from the `afterChange` and `afterDelete` hooks of the content collections and the footer
 * global (see `hooks.ts`). A cache failure must never fail an editor's save, so errors are logged
 * and not thrown.
 *
 * Outside a request context (for example `pnpm seed`), Next cannot invalidate the cache. In that
 * case restart the dev server, or sign in to /admin and use "Refresh live site cache" (POST
 * /api/revalidate) once the server is running.
 */
export const revalidatePortfolio = (): void => {
  try {
    revalidateTag(PORTFOLIO_CACHE_TAG, 'max')
  } catch (error) {
    console.warn(
      `[portfolio] Could not revalidate the "${PORTFOLIO_CACHE_TAG}" cache tag:`,
      error instanceof Error ? error.message : error,
      '\n[portfolio] Out-of-band change detected — restart the dev server, or use "Refresh live site cache" in the admin gear menu (POST /api/revalidate).',
    )
  }
}
