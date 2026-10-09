'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

// Ported from ProgressBar in vTarikhi/components/sections/skills.tsx.

export type ProgressBarProps = {
  /** Stable key from the parent. It is not rendered. */
  id: string
  /** Target value, 0-100. */
  value: number
  label?: string
  /** Bootstrap contextual colour name, e.g. "success". */
  color: string
  /** Delay before the animation starts, in seconds. */
  delay?: number
}

export function ProgressBar({ value, label, color, delay = 0 }: ProgressBarProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Animates once, when the bar is 30% visible.
  const isInView = useInView(ref, {
    once: true,
    amount: 0.3,
    margin: '0px 0px -50px 0px',
  })

  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => {
        setProgress(value)
      }, delay * 1000)

      return () => clearTimeout(timer)
    }
  }, [isInView, value, delay])

  return (
    <div ref={ref} className="skill mb-4">
      {label && (
        <div className="d-flex justify-content-between">
          <h4 className="h6 font-weight-bold">{label}</h4>
          <h5 className="h6 font-weight-bold">{progress}%</h5>
        </div>
      )}
      <div className="progress">
        <motion.div
          className={`progress-bar bg-${color}`}
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, delay: delay }}
        />
      </div>
    </div>
  )
}
