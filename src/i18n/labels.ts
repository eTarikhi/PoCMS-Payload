import type { LabelFunction } from 'payload'

/**
 * A label that resolves through Payload's `t` from our `custom` namespace.
 *
 * The key is `namespace:key` with no dots: Payload splits on the first colon only. Payload types `t`
 * against its own catalogue and this version has no module-augmentation hook for additional keys, so
 * the cast lives here once instead of in every label. A unit test checks every key used in the code
 * against `src/i18n/en.ts`.
 */
export const customLabel =
  (key: string): LabelFunction =>
  ({ t }) =>
    (t as unknown as (translationKey: string) => string)(key)
