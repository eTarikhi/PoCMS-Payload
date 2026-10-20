import { en as payloadEn } from '@payloadcms/translations/languages/en'

import { en as customEn } from './en'

/**
 * English with this repository's `custom` strings merged over Payload's own catalogue. Payload's
 * `Language` object also carries the label and the date-fns key, so the object is built once here
 * and used for both `supportedLanguages` and `translations`.
 */
export const english = {
  ...payloadEn,
  translations: { ...payloadEn.translations, ...customEn },
}

export const i18nConfig = {
  supportedLanguages: { en: english },
  translations: { en: english.translations },
} as const
