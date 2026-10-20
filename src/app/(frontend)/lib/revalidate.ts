import { revalidatePath, revalidateTag } from 'next/cache'

/** Cache tag shared by every portfolio query in `cache.ts` and `articles.ts`. */
export const PORTFOLIO_CACHE_TAG = 'portfolio'

/**
 * Marks the public site's cached content as stale.
 *
 * Called from the `afterChange` and `afterDelete` hooks of the content collections and the footer
 * global (see `hooks.ts`). A cache failure must never fail an editor's save, so errors are logged
 * and not thrown.
 *
 * Next 16's `revalidateTag` takes a cache-life profile: `'max'` only marks entries stale and lets
 * the next request serve them while they revalidate in the background, so an edited article kept
 * its old page until a second visit (and a trashed one kept answering 200). `{ expire: 0 }` expires
 * the tagged data immediately. `revalidatePath` then drops the rendered route, because the article
 * page is prerendered per slug and would otherwise keep its cached HTML.
 */
export const revalidatePortfolio = (paths: string[] = []): void => {
  try {
    revalidateTag(PORTFOLIO_CACHE_TAG, { expire: 0 })
    for (const path of paths) revalidatePath(path)
  } catch (error) {
    console.error(
      `[portfolio] Could not revalidate the "${PORTFOLIO_CACHE_TAG}" cache tag:`,
      error instanceof Error ? error.message : error,
    )
  }
}
