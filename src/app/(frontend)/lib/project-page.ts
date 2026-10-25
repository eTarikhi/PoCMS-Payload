import { hasLexicalContent } from './lexical'

/**
 * Pure helpers for project case-study pages (`/projects/[slug]`).
 * No Payload or Next runtime imports.
 */

export type ProjectBodyFields = {
  slug?: string | null
  content?: unknown
}

/** A project has an on-site case-study page when it has a slug and non-empty Lexical `content`. */
export const hasProjectPage = (doc: ProjectBodyFields): boolean =>
  Boolean(doc.slug) && hasLexicalContent(doc.content)

export const PROJECTS_HUB_PATH = '/projects'

export const projectPagePath = (slug: string): string => `${PROJECTS_HUB_PATH}/${slug}`
