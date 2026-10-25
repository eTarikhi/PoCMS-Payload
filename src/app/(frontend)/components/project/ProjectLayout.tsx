import Link from 'next/link'

import { DEFAULT_SITE_SETTINGS } from '@/app/(frontend)/lib/mappers'
import type { ProjectDetail } from '@/app/(frontend)/lib/project-mappers'
import { ArticleCover } from '../article/ArticleCover'
import { ReadingProgress } from '../article/ReadingProgress'
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

export function ProjectLayout({
  project,
  labels = DEFAULT_PROJECT_LABELS,
}: {
  project: ProjectDetail
  labels?: ProjectPageLabels
}) {
  const hasMetaRow = Boolean(
    project.role || project.client || project.year || project.readTimeDisplay,
  )

  return (
    <>
      <ReadingProgress />
      <article className="article-layout project-layout">
        <header className="article-header">
          <div className="article-category-row">
            <span className="article-category">{labels.caseStudyLabel}</span>
            {project.categoryLabels.map((cat) => (
              <span key={cat} className="project-tech-pill">
                {cat}
              </span>
            ))}
          </div>

          <h1 className="article-title">{project.title}</h1>
          {project.excerpt ? <p className="article-excerpt">{project.excerpt}</p> : null}

          {hasMetaRow ? (
            <div className="project-meta-grid">
              {project.role ? (
                <div>
                  <span className="project-meta-label">Role</span>
                  <span className="project-meta-value">{project.role}</span>
                </div>
              ) : null}
              {project.client ? (
                <div>
                  <span className="project-meta-label">Client</span>
                  <span className="project-meta-value">{project.client}</span>
                </div>
              ) : null}
              {project.year ? (
                <div>
                  <span className="project-meta-label">Year</span>
                  <span className="project-meta-value">{project.year}</span>
                </div>
              ) : null}
              {project.readTimeDisplay ? (
                <div>
                  <span className="project-meta-label">Reading time</span>
                  <span className="project-meta-value">{project.readTimeDisplay}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {project.techStack.length > 0 ? (
            <ul className="project-tech-list" aria-label="Technology stack">
              {project.techStack.map((tech) => (
                <li key={tech} className="project-tech-pill">
                  {tech}
                </li>
              ))}
            </ul>
          ) : null}

          {project.liveUrl || project.readMoreUrl ? (
            <div className="project-actions">
              {project.liveUrl ? (
                <a
                  href={project.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="project-cta-primary"
                >
                  {labels.liveProjectLabel} ↗
                </a>
              ) : null}
              {project.readMoreUrl ? (
                <a
                  href={project.readMoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="project-cta-secondary"
                >
                  Source / Details ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </header>

        {project.coverUrl ? (
          <ArticleCover src={project.coverUrl} alt={project.coverAlt} />
        ) : null}

        <TableOfContents items={project.toc} />

        {project.content ? (
          <RichTextContent data={project.content} className="article-body" />
        ) : null}

        <div className="article-footer-nav">
          <Link href="/#project">{labels.backToProjectsLabel}</Link>
          {project.liveUrl ? (
            <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
              {labels.liveProjectLabel}
            </a>
          ) : null}
        </div>
      </article>
    </>
  )
}
