import Link from 'next/link'

import { DEFAULT_HEADER_STUDIO, DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { ProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import { PROJECTS_HUB_PATH } from '@/app/(frontend)/lib/project-page'
import type { ProjectDetailHeaderConfig, ProjectItem } from '@/app/(frontend)/lib/types'
import { ArticleCover } from '../article/ArticleCover'
import { ReadingProgress } from '../article/ReadingProgress'
import { DetailPageHeader } from '../headers/DetailPageHeader'
import { MobileTocDrawer, StickyTocRail } from '../headers/StickyTocRail'
import { RichTextContent } from '../richtext/RichTextContent'
import { TableOfContents } from '../richtext/TableOfContents'

export type ProjectPageLabels = {
  caseStudyLabel: string
  backToProjectsLabel: string
  liveProjectLabel: string
}

const DEFAULT_PROJECT_LABELS: ProjectPageLabels = {
  caseStudyLabel: DEFAULT_SITE_SETTINGS.projectsSection.caseStudyLabel,
  backToProjectsLabel: DEFAULT_SITE_SETTINGS.projectsSection.backToProjectsLabel,
  liveProjectLabel: DEFAULT_SITE_SETTINGS.projectsSection.liveProjectLabel,
}

export type ProjectLayoutProps = {
  project: ProjectDetail
  labels?: ProjectPageLabels
  headerConfig?: ProjectDetailHeaderConfig
  relatedProjects?: ProjectItem[]
}

export function ProjectLayout({
  project,
  labels = DEFAULT_PROJECT_LABELS,
  headerConfig,
  relatedProjects = [],
}: ProjectLayoutProps) {
  const effectiveHeader = headerConfig ?? DEFAULT_HEADER_STUDIO.projectDetail
  const tocItems = project.toc ?? []
  const hasStickyRail = effectiveHeader.showStickySidebar && tocItems.length > 0
  const showContinuation = effectiveHeader.showRelatedProjects && relatedProjects.length > 0

  const badges = [labels.caseStudyLabel, ...project.categoryLabels].filter(Boolean)

  return (
    <div className="pocms-subpage-shell">
      <ReadingProgress />

      <DetailPageHeader
        variant="project"
        eyebrow={effectiveHeader.eyebrow}
        badges={badges}
        title={project.title}
        excerpt={project.excerpt}
        coverUrl={project.coverUrl}
        backgroundPreset={effectiveHeader.backgroundPreset}
        accentTone={effectiveHeader.accentTone}
        showBreadcrumbs={effectiveHeader.showBreadcrumbs}
        hubLabel="Projects"
        hubHref={PROJECTS_HUB_PATH}
        backLabel="← All projects"
        role={project.role}
        client={project.client}
        year={project.year}
        readTimeDisplay={project.readTimeDisplay}
        techStack={project.techStack}
        showSpecDock={effectiveHeader.showSpecDock}
        showTechLinks={effectiveHeader.showTechLinks}
        liveUrl={project.liveUrl}
        liveLabel={labels.liveProjectLabel}
        secondaryUrl={project.readMoreUrl}
        secondaryLabel="Source / Details"
      />

      <div className="pocms-inner-main">
        <div className="container-xxl px-4 px-lg-5">
          <div
            className={`pocms-reading-grid ${
              hasStickyRail ? 'pocms-reading-grid--with-rail' : 'pocms-reading-grid--single'
            }`}
          >
            <div className="pocms-reading-main">
              <article className="article-layout project-layout">
              {project.coverUrl ? (
                <ArticleCover
                  src={project.coverUrl}
                  alt={project.coverAlt}
                  blurDataURL={project.coverBlurDataURL}
                />
              ) : null}

                {hasStickyRail ? (
                  <MobileTocDrawer items={tocItems} />
                ) : (
                  <TableOfContents items={tocItems} />
                )}

                {project.content ? (
                  <RichTextContent data={project.content} className="article-body" />
                ) : null}

                <div className="article-footer-nav">
                  <Link href={PROJECTS_HUB_PATH}>{labels.backToProjectsLabel}</Link>
                  {project.liveUrl ? (
                    <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
                      {labels.liveProjectLabel}
                    </a>
                  ) : null}
                </div>
              </article>
            </div>

            {hasStickyRail && (
              <aside className="pocms-reading-rail" aria-label="Case study navigation">
                <StickyTocRail items={tocItems} />
                <div className="pocms-sticky-toc-card">
                  <p className="pocms-sticky-toc-card__title">Quick Actions</p>
                  <div className="d-flex flex-column gap-2">
                    <a href="#main-content" className="pocms-utility-btn justify-content-between">
                      <span>Back to top</span>
                      <span aria-hidden="true">↑</span>
                    </a>
                    <Link
                      href={PROJECTS_HUB_PATH}
                      className="pocms-utility-btn justify-content-between"
                    >
                      <span>All projects</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </aside>
            )}
          </div>

          {showContinuation && (
            <section
              className="pocms-continuation mx-auto"
              style={{ maxWidth: '1140px' }}
              aria-label="More selected projects"
            >
              <div className="pocms-section-kicker">
                <h2 className="pocms-section-kicker__title">More Selected Projects</h2>
                <Link href={PROJECTS_HUB_PATH} className="pocms-utility-btn">
                  View all projects →
                </Link>
              </div>
              <div className="row g-4">
                {relatedProjects.slice(0, 3).map((item) => {
                  const href = item.pagePath ?? (item.url || '#')
                  const internal = href.startsWith('/')
                  return (
                    <div key={item.id} className="col-md-4">
                      <Link
                        href={href}
                        {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                        className="pocms-continuation-card"
                      >
                        <span className="small" style={{ color: 'var(--pocms-sand)' }}>
                          {[item.role, item.year].filter(Boolean).join(' • ') || 'Portfolio Build'}
                        </span>
                        <h3 className="pocms-continuation-card__title">{item.title}</h3>
                        {item.excerpt && (
                          <p className="small text-white-50 mb-0 mt-auto">{item.excerpt}</p>
                        )}
                      </Link>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
