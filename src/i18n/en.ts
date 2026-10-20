/**
 * Admin translations (roadmap P4.5).
 *
 * Payload ships translations for its own interface; everything this repository adds lives under the
 * `custom` namespace so it cannot collide with a Payload key. The admin runs in English today, so
 * this file is the single place a second language would be dropped into: register it in
 * `payload.config.ts` under `i18n.translations` and `supportedLanguages`, and every string below
 * becomes translatable without touching a component.
 *
 * Labels declared in config (`dashboard.widgets[].label`, field labels) take a function that
 * receives `t`, so they are resolved per request, not frozen at boot. Client components call
 * `useTranslation()` and the same keys.
 */
export const en = {
  custom: {
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
      fields: {
        collection: 'Collection',
        period: 'Period',
        formFactor: 'Form factor',
      },
      period: {
        last7: 'Last 7 days',
        last30: 'Last 30 days',
        last90: 'Last 90 days',
      },
      devices: {
        phones: 'Phones',
        desktops: 'Desktops',
        all: 'All devices',
      },
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
  },
}

/** Keys under `custom`, flattened for the test that every key a component asks for exists. */
export type CustomTranslationKey = string
