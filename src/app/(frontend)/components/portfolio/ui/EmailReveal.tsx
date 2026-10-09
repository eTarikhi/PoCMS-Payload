'use client'

import Link from 'next/link'
import { useState } from 'react'

// Ported from the email contact row in vTarikhi/components/footer.tsx.
// The address stays hidden until the visitor clicks, which keeps it out of the initial HTML text.

export type EmailRevealProps = {
  /** Address in "user@domain" form. */
  email: string
  className?: string
}

// Same split-and-join as the original revealEmail(), kept verbatim.
const revealEmail = (encodedEmail: string) => {
  const [username, domain] = encodedEmail.split('@')
  return `${username}@${domain}`
}

export function EmailReveal({ email, className }: EmailRevealProps) {
  const [emailRevealed, setEmailRevealed] = useState(false)

  return (
    <span
      className={className}
      onClick={() => setEmailRevealed(true)}
      style={{ cursor: 'pointer' }}
      title={emailRevealed ? 'Click to email' : 'Click to reveal email'}
    >
      {emailRevealed ? (
        <Link className={className} href={`mailto:${revealEmail(email)}`} target="_blank">
          {revealEmail(email)}
        </Link>
      ) : (
        'Click to reveal email'
      )}
    </span>
  )
}
