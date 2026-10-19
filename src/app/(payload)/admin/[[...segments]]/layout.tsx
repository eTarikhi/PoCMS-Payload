import type React from 'react'

/**
 * Route segment config for the admin (this file is ours; page.tsx next to it is Payload's).
 *
 * The Page speed widget streams in a Lighthouse run that takes 10–40 s, and the response stays
 * open until it arrives. On Vercel without Fluid compute, functions stop after 10 s unless they
 * ask for more; 60 s is allowed on every plan. With Fluid compute the default is higher already.
 * https://vercel.com/docs/functions/configuring-functions/duration
 */
export const maxDuration = 60

export default function AdminSegmentLayout({ children }: { children: React.ReactNode }) {
  return children
}
