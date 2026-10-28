'use client'

import { useCallback, useState } from 'react'

type CopyCodeButtonProps = {
  code: string
  label?: string
}

export function CopyCodeButton({ code, label = 'Copy' }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API unavailable in restricted contexts.
    }
  }, [code])

  return (
    <button
      type="button"
      className="rich-code-copy"
      onClick={handleCopy}
      aria-label={copied ? 'Copied code to clipboard' : 'Copy code to clipboard'}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
