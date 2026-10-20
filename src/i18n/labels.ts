import type { LabelFunction } from 'payload'

/**
 * A label that resolves through Payload's `t` from our `custom` namespace.
 *
 * Payload types `t` against its own catalogue, and this version has no module-augmentation hook for
 * additional keys, so the cast lives here once instead of in every label. The key still has to exist
 * in `src/i18n/en.ts` — a unit test checks every `custom:` key used in the code against that file.
 */
export const customLabel =
  (key: string): LabelFunction =>
  ({ t }) =>
    (t as unknown as (translationKey: string) => string)(key)
