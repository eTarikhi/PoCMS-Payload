import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

import { revalidatePortfolio } from './revalidate'

/**
 * Hooks that refresh the home-page cache when editors change content.
 *
 * Attach `portfolioAfterChange` and `portfolioAfterDelete` to every content collection and the
 * `footer` global. Each hook makes one `revalidatePortfolio()` call, which never throws, so a failed
 * refresh cannot fail the save (roadmap §3.2).
 */
export const portfolioAfterChange: CollectionAfterChangeHook & GlobalAfterChangeHook = ({
  doc,
}) => {
  revalidatePortfolio()
  return doc
}

export const portfolioAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  revalidatePortfolio()
  return doc
}
