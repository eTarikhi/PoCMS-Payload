/**
 * Admin translations (roadmap P4.5).
 *
 * Payload ships translations for its own interface; everything this repository adds lives in the
 * namespaces below (`widgets`, `imageSource`, `pagination`, `a11y`). A second language would be
 * another file of the same shape registered in `payload.config.ts` — no component changes.
 *
 * Keys are **flat inside a namespace**: Payload's `t` splits `key` on the first colon and then looks
 * the rest up as a single property, so `t('custom:widgets.welcome')` cannot resolve a nested object.
 * `t('widgets:welcome')` is the shape that works.
 *
 * Labels declared in config (`dashboard.widgets[].label`, field labels) take a function that
 * receives `t`, so they are resolved per request, not frozen at boot. Client components call
 * `useTranslation()` and the same keys.
 */
export const en = {
  widgets: {
    welcome: 'Welcome',
    contentHealth: 'Needs attention',
    contentCount: 'Content count',
    publishingActivity: 'Publishing activity',
    recentChanges: 'Recent changes',
    siteTraffic: 'Site traffic',
    pageSpeed: 'Page speed',
    deployments: 'Deployments',
    ciStatus: 'CI status',
    auditLog: 'Audit log',
    collections: 'Collections',
    collection: 'Collection',
    period: 'Period',
    last7: 'Last 7 days',
    last30: 'Last 30 days',
    last90: 'Last 90 days',
    formFactor: 'Form factor',
    phones: 'Phones',
    desktops: 'Desktops',
    allDevices: 'All devices',
  },
  imageSource: {
    mediaLibrary: 'Media library',
    externalUrl: 'External URL',
    externalUrlDefault: 'External image URL',
    externalUrlDescription: 'Used only when no file is chosen above. Full https:// URL.',
    usesUpload: 'The site uses the media library file.',
    usesUrl: 'The site uses the external URL.',
    usesNothing: 'No image yet: the site falls back to its placeholder.',
    uploadWins: 'The URL is kept but ignored while a file is chosen.',
    brokenUrl: 'That URL does not load an image.',
    tabListLabel: 'Image source',
  },
  pagination: {
    previous: 'Previous page',
    next: 'Next page',
  },
  a11y: {
    skipToContent: 'Skip to main content',
    dashboardTitle: 'Dashboard',
    loginTitle: 'Sign in to PoCMS',
    selectAllRows: 'Select all rows on this page',
    selectRow: 'Select row',
    moreDocumentActions: 'More document actions',
    editFile: 'Edit file',
    removeFile: 'Remove file',
    clearDate: 'Clear date',
  },
}

/** Every namespace this repository adds, for the test that keys resolve to strings. */
export type CustomTranslationNamespace = keyof typeof en
