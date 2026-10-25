'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { config } from '@fortawesome/fontawesome-svg-core'
import { faBookOpen, faEye, faLink } from '@fortawesome/free-solid-svg-icons'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { ProjectFilter, ProjectItem } from '@/app/(frontend)/lib/types'

config.autoAddCss = false

export type ProjectsGridProps = {
  heading?: string
  caseStudyLabel?: string
  filters: ProjectFilter[]
  items: ProjectItem[]
}

const filterItems = (items: ProjectItem[], filter: string): ProjectItem[] =>
  filter === '*' ? items : items.filter((item) => item.categories.includes(filter))

export function ProjectsGrid({
  heading = DEFAULT_SITE_SETTINGS.projectsSection.heading,
  caseStudyLabel = DEFAULT_SITE_SETTINGS.projectsSection.caseStudyLabel,
  filters,
  items,
}: ProjectsGridProps) {
  const [activeFilter, setActiveFilter] = useState('*')
  const [appliedFilter, setAppliedFilter] = useState('*')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setAppliedFilter(filter), 100)
  }

  const visibleItems = filterItems(items, appliedFilter)

  return (
    <>
      <div className="row g-5 mb-5 align-items-center wow fadeInUp" data-wow-delay="0.1s">
        <div className="col-lg-6">
          <h2 className="h1 display-5 mb-0">{heading}</h2>
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
            <ProjectCard key={item.id} item={item} caseStudyLabel={caseStudyLabel} />
          ))}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function ProjectCard({
  item,
  caseStudyLabel,
}: {
  item: ProjectItem
  caseStudyLabel: string
}) {
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
            <FontAwesomeIcon icon={faEye} className="text-xl" />
          </motion.a>
          {item.pagePath ? (
            <Link
              className="btn btn-lg-square btn-outline-primary border-2 mx-1"
              href={item.pagePath}
              aria-label={`${caseStudyLabel}: ${item.title}`}
              title={`${caseStudyLabel}: ${item.title}`}
            >
              <FontAwesomeIcon icon={faBookOpen} className="text-xl" />
            </Link>
          ) : null}
          {item.url && item.url !== item.pagePath ? (
            <motion.a
              className="btn btn-lg-square btn-outline-primary border-2 mx-1"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              aria-label={`Visit ${item.title}`}
            >
              <FontAwesomeIcon icon={faLink} className="text-xl" />
            </motion.a>
          ) : null}
        </div>
      </div>
      {item.pagePath ? (
        <div className="mt-2 d-flex justify-content-between align-items-center px-1">
          <span className="small fw-semibold text-white">{item.title}</span>
          <Link href={item.pagePath} className="small text-secondary text-decoration-none">
            {caseStudyLabel} →
          </Link>
        </div>
      ) : null}
    </motion.div>
  )
}
