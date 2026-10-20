'use client'

import { useTranslation } from '@payloadcms/ui'
import { useCallback } from 'react'

/**
 * `t` narrowed to our `custom` keys for client components (see `labels.ts` for the reason). The
 * returned function is stable, so it is safe in dependency arrays.
 */
export const useCustomT = (): ((key: string) => string) => {
  const { t } = useTranslation()
  return useCallback((key: string) => (t as unknown as (translationKey: string) => string)(key), [t])
}
