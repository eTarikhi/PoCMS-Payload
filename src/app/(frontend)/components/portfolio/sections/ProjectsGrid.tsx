'use client'

import { useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { config } from '@fortawesome/fontawesome-svg-core'
import { faEye, faLink } from '@fortawesome/free-solid-svg-icons'

import type { ProjectFilter, ProjectItem } from '@/app/(frontend)/lib/portfolio/types'

// The root layout loads the Font Awesome CSS. Icons in this client bundle must not inject their own copy.
config.autoAddCss = false

// Ported from ProjectSection and projectCards in vTarikhi/components/sections/projects.tsx.
// The title row and the filter list are part of this component, because they share a row with the filter state.
// ProjectsSection (server) provides the section and container wrappers.

export type ProjectsGridProps = {
  filters: ProjectFilter[]
  items: ProjectItem[]
}

// "*" means all projects. Any other value matches a project's categories.
const filterItems = (items: ProjectItem[], filter: string): ProjectItem[] =>
  filter === '*' ? items : items.filter((item) => item.categories.includes(filter))

export function ProjectsGrid({ filters, items }: ProjectsGridProps) {
  // activeFilter drives the highlighted button at once. appliedFilter drives the grid after a 100ms delay.
  const [activeFilter, setActiveFilter] = useState('*')
  const [appliedFilter, setAppliedFilter] = useState('*')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter)
    clearTimeout(timerRef.current)
    // The delay is kept from the original, so the grid changes after the button state has updated.
    timerRef.current = setTimeout(() => setAppliedFilter(filter), 100)
  }

  const visibleItems = filterItems(items, appliedFilter)

  return (
    <>
      <div className="row g-5 mb-5 align-items-center wow fadeInUp" data-wow-delay="0.1s">
        <div className="col-lg-6">
          <h2 className="h1 display-5 mb-0">My Projects</h2>
        </div>
        <div className="col-lg-6 text-lg-end">
          <motion.ul className="list-inline mx-auto mb-0" id="portfolio-flters">
            {filters.map((filter) => (
              <motion.li
                key={filter.value}
                className={`m-3 ${activeFilter === filter.value ? 'active' : ''}`}
                onClick={() => handleFilterChange(filter.value)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {filter.label}
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          className="row g-4 portfolio-container wow fadeInUp"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {visibleItems.map((item) => (
            <ProjectCard key={item.id} item={item} />
          ))}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function ProjectCard({ item }: { item: ProjectItem }) {
  // The grid shows a small thumbnail first. Once it loads, the full-size image replaces it (original behaviour).
  const handleImageOverride = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.src = item.imageUrl
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5 }}
      className="col-lg-4 col-md-6 portfolio-item"
    >
      <div className="portfolio-img rounded overflow-hidden">
        <Image
          className="img-fluid"
          src={item.thumbnailUrl}
          alt={item.title}
          width={400}
          height={400}
          loading="lazy"
          unoptimized={true}
          onLoad={handleImageOverride}
        />

        <div className="portfolio-btn">
          <motion.a
            className="btn btn-lg-square btn-outline-primary border-2 mx-1"
            href={item.imageUrl}
            data-lightbox="portfolio"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label={`View full image of ${item.title}`}
          >
            <FontAwesomeIcon icon={faEye} className="text-xl"></FontAwesomeIcon>
          </motion.a>
          <motion.a
            className="btn btn-lg-square btn-outline-primary border-2 mx-1"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label={`Visit ${item.title}`}
          >
            <FontAwesomeIcon icon={faLink} className="text-xl"></FontAwesomeIcon>
          </motion.a>
        </div>
      </div>
    </motion.div>
  )
}
