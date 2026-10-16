export const DEFAULT_LOCALE = 'en' as const

export const SUPPORTED_LOCALES = [DEFAULT_LOCALE, 'fa'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

type PayloadLocale = {
  code: Locale
  fallbackLocale?: Locale
  label: string
  rtl?: boolean
}

export const PAYLOAD_LOCALES: PayloadLocale[] = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'فارسی', rtl: true, fallbackLocale: DEFAULT_LOCALE },
]

type LocaleDetails = {
  dateLocale: string
  direction: 'ltr' | 'rtl'
  htmlLang: string
  openGraphLocale: string
  pathPrefix: '' | '/fa'
}

export const LOCALE_DETAILS: Record<Locale, LocaleDetails> = {
  en: {
    dateLocale: 'en-US',
    direction: 'ltr',
    htmlLang: 'en',
    openGraphLocale: 'en_US',
    pathPrefix: '',
  },
  fa: {
    dateLocale: 'fa-IR',
    direction: 'rtl',
    htmlLang: 'fa',
    openGraphLocale: 'fa_IR',
    pathPrefix: '/fa',
  },
}

export const isLocale = (value: string): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value)

/** Returns an internal public path in the requested locale without a trailing slash. */
export const localizePath = (locale: Locale, path: string = '/'): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const prefix = LOCALE_DETAILS[locale].pathPrefix
  if (!prefix || normalizedPath === '/') return prefix || normalizedPath
  return `${prefix}${normalizedPath}`
}
