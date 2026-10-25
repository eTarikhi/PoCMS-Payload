import { PayloadRedirects } from '@/app/(frontend)/components/seo/PayloadRedirects'

type CatchAllProps = {
  params: Promise<{ segments: string[] }>
}

/**
 * Catch-all route for arbitrary paths on the frontend.
 * Resolves any matching `301`/`302` redirect configured in Payload (`@payloadcms/plugin-redirects`),
 * and falls through to `notFound()` when none matches.
 */
export default async function FrontendCatchAllPage({ params }: CatchAllProps) {
  const { segments } = await params
  const url = `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`
  return <PayloadRedirects url={url} />
}
