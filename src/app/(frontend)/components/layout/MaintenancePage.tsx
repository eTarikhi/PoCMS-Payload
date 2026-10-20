import type { SiteSettingsContent } from '@/app/(frontend)/lib/types'

/**
 * The page every public route shows while `SiteSettings.maintenance.enabled` is on (CNT).
 *
 * Deliberately self-contained: no navigation, no footer, no content queries, so it keeps rendering
 * even if the rest of the content is mid-migration. /admin and the REST API are not affected —
 * the switch lives in the admin, so it can always be turned off again.
 *
 * `maintenance-page` in main.css covers what Bootstrap utilities do not: the dark backdrop over the
 * site background image and comfortable line length.
 */
export function MaintenancePage({ settings }: { settings: SiteSettingsContent }) {
  const { siteName, supportEmail, maintenance } = settings

  return (
    <main id="main-content" className="maintenance-page d-flex align-items-center min-vh-100 px-3">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 text-center text-lg-start">
            <p className="maintenance-page__name text-primary fw-bold text-uppercase mb-2">
              {siteName}
            </p>
            <h1 className="text-white fw-bold mb-3">{maintenance.title}</h1>
            <p className="text-light mb-4">{maintenance.message}</p>
            {supportEmail ? (
              <a className="btn btn-primary px-4" href={`mailto:${supportEmail}`}>
                Email us
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
