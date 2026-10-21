'use client'

import { StudioFailure } from './components/studio/StudioFailure'

export default function FrontendError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <StudioFailure retry={reset} />
}
