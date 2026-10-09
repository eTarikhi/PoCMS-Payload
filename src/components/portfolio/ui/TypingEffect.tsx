'use client'

import { useEffect, useState } from 'react'

// Ported from TypingEffect in vTarikhi/components/header.tsx. Speeds and pauses are unchanged.

export type TypingEffectProps = {
  /** Strings cycled through by the effect. */
  texts: string[]
  typeSpeed?: number
  deleteSpeed?: number
  /** Pause after a string is fully typed, before deleting starts. */
  pauseTime?: number
  /** When false, the effect stops after one pass through `texts`. */
  infinite?: boolean
  color?: string
  cursorColor?: string
}

export function TypingEffect({
  texts,
  typeSpeed = 100,
  deleteSpeed = 20,
  pauseTime = 200,
  infinite = true,
  color = 'black',
  cursorColor = 'gray',
}: TypingEffectProps) {
  const [displayText, setDisplayText] = useState('')
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [iterationCount, setIterationCount] = useState(0)

  useEffect(() => {
    const handleTyping = () => {
      const currentText = texts[currentTextIndex]
      if (!isDeleting) {
        if (displayText.length < currentText.length) {
          setDisplayText(currentText.substring(0, displayText.length + 1))
        } else {
          setTimeout(() => setIsDeleting(true), pauseTime)
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(currentText.substring(0, displayText.length - 1))
        } else {
          setIsDeleting(false)
          setCurrentTextIndex((currentTextIndex + 1) % texts.length)
          if (!infinite) {
            setIterationCount((prev) => prev + 1)
          }
        }
      }
    }

    // Stop when the effect is not infinite and every text has been shown once.
    if (!infinite && iterationCount >= texts.length) {
      return
    }

    const speed = isDeleting ? deleteSpeed : typeSpeed
    const timer = setTimeout(handleTyping, speed)
    return () => clearTimeout(timer)
  }, [
    displayText,
    currentTextIndex,
    isDeleting,
    texts,
    typeSpeed,
    deleteSpeed,
    pauseTime,
    infinite,
    iterationCount,
  ])

  return (
    <span className="typing-effect" style={{ color, position: 'relative' }}>
      {displayText}{' '}
      <span className="cursor" style={{ color: cursorColor, animation: 'blink 0.7s infinite' }}>
        {'| '}
      </span>
    </span>
  )
}
