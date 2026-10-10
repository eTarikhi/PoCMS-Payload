'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Ported from BackToTopButton in vTarikhi/components/libraries.jsx. The timings and easing are unchanged.

const SCROLL_DURATION_MS = 1500

// Ease-in-out curve used for the scroll animation.
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)

export function BackToTop() {
  const [showButton, setShowButton] = useState(false)

  // Shown once the page is scrolled more than 300px down.
  useEffect(() => {
    const handleScroll = () => {
      setShowButton(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    const startScrollY = window.scrollY
    const startTime = performance.now()

    const animateScroll = (currentTime: number) => {
      const progress = Math.min((currentTime - startTime) / SCROLL_DURATION_MS, 1)
      const easeProgress = easeInOut(progress)

      window.scrollTo(0, startScrollY * (1 - easeProgress))

      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      }
    }

    requestAnimationFrame(animateScroll)
  }

  if (!showButton) {
    return null
  }

  return (
    <motion.button
      className="btn btn-lg btn-primary btn-lg-square back-to-top wow fadeInUp"
      onClick={scrollToTop}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      transition={{ duration: 0.7 }}
    >
      <i className="bi bi-arrow-up"></i>
    </motion.button>
  )
}
