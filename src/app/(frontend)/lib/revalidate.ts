import { revalidateTag } from 'next/cache'

/** Cache tag shared by every portfolio query in `cache.ts`. */
export const PORTFOLIO_CACHE_TAG = 'portfolio'

/**
 * Marks the cached home-page content as stale.
 *
 * Called from the `afterChange` and `afterDelete` hooks of the content collections and the footer
 * global (see `hooks.ts`). A cache failure must never fail an editor's save, so errors are logged
 * and not thrown.
 */
export const revalidatePortfolio = (): void => {
  try {
    revalidateTag(PORTFOLIO_CACHE_TAG, 'max')
  } catch (error) {
    console.error(
      `[portfolio] Could not revalidate the "${PORTFOLIO_CACHE_TAG}" cache tag:`,
      error instanceof Error ? error.message : error,
    )
  }
}
