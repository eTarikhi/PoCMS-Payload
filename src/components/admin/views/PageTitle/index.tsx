import type { I18n } from '@payloadcms/translations'
import React from 'react'

/**
 * The page's one `<h1>`, for the two admin screens Payload renders without a heading (P6.2).
 *
 * Payload's list and document views title themselves with an `<h1>`, and the custom views in
 * `views/` do the same. The dashboard starts at its widgets (`<h2>`) and the sign-in screen starts
 * at the form fields, so screen readers had no page heading to announce on either. Both slots run
 * above the content, so the heading stays the first thing in the reading order.
 *
 * Visually hidden rather than added to the design: the dashboard already shows the user's name and
 * the breadcrumb says "Dashboard", and the sign-in screen shows the brand; a visible second title
 * would duplicate them. The text comes from the `a11y` namespace so a translation file can add it
 * without touching these components.
 */
type TitleProps = { i18n?: I18n }

function translate(i18n: TitleProps['i18n'], key: string): string {
  const t = i18n?.t as unknown as ((translationKey: string) => string) | undefined
  return t ? t(key) : key
}

export function DashboardTitle({ i18n }: TitleProps) {
  return <h1 className="acn:sr-only">{translate(i18n, 'a11y:dashboardTitle')}</h1>
}

export function LoginTitle({ i18n }: TitleProps) {
  return <h1 className="acn:sr-only">{translate(i18n, 'a11y:loginTitle')}</h1>
}
