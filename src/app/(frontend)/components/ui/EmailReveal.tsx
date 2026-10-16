'use client'

import Link from 'next/link'
import { useState } from 'react'

export type EmailRevealProps = {
  /** Address in "user@domain" form. */
  clickToEmail: string
  clickToReveal: string
  email: string
  className?: string
}

const revealEmail = (encodedEmail: string) => {
  const [username, domain] = encodedEmail.split('@')
  return `${username}@${domain}`
}

export function EmailReveal({ className, clickToEmail, clickToReveal, email }: EmailRevealProps) {
  const [emailRevealed, setEmailRevealed] = useState(false)

  return (
    <span
      className={className}
      onClick={() => setEmailRevealed(true)}
      style={{ cursor: 'pointer' }}
      title={emailRevealed ? clickToEmail : clickToReveal}
    >
      {emailRevealed ? (
        <Link className={className} href={`mailto:${revealEmail(email)}`} target="_blank">
          {revealEmail(email)}
        </Link>
      ) : (
        clickToReveal
      )}
    </span>
  )
}
