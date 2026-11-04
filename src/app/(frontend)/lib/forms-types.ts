import type { Article, Form, Project } from '@/payload-types'

import { articlePagePath } from './article-page'
import { projectPagePath } from './project-page'

/**
 * Pure, client-safe form types and mappers for `@payloadcms/plugin-form-builder` documents.
 * Recipient notification templates (`form.emails`) are intentionally never mapped to client props.
 */

export type PublicFormSelectOption = {
  label: string
  value: string
}

export type PublicCmsFormField =
  | {
      blockType: 'text' | 'email' | 'textarea'
      id: string
      name: string
      label: string
      width: number
      required: boolean
      defaultValue: string
    }
  | {
      blockType: 'number'
      id: string
      name: string
      label: string
      width: number
      required: boolean
      defaultValue: string
    }
  | {
      blockType: 'checkbox'
      id: string
      name: string
      label: string
      width: number
      required: boolean
      defaultChecked: boolean
    }
  | {
      blockType: 'select'
      id: string
      name: string
      label: string
      width: number
      required: boolean
      defaultValue: string
      placeholder?: string
      options: PublicFormSelectOption[]
    }
  | {
      blockType: 'message'
      id: string
      message: Form['confirmationMessage']
    }

export type PublicCmsForm = {
  id: number | string
  slug: string
  title: string
  submitButtonLabel: string
  confirmationType: 'message' | 'redirect'
  confirmationMessage: Form['confirmationMessage']
  redirectHref: string | null
  fields: PublicCmsFormField[]
}

const normalizeWidth = (width?: number | null): number => {
  if (typeof width !== 'number' || !Number.isFinite(width)) return 100
  return Math.min(100, Math.max(25, Math.round(width)))
}

const resolveRedirectHref = (redirect?: Form['redirect'] | null): string | null => {
  if (!redirect) return null
  if (redirect.type === 'custom') {
    const url = redirect.url?.trim()
    return url && url.length > 0 ? url : null
  }
  if (redirect.type === 'reference' && redirect.reference && typeof redirect.reference === 'object') {
    const { relationTo, value } = redirect.reference
    if (value && typeof value === 'object' && 'slug' in value) {
      const slug = (value as Partial<Article | Project>).slug?.trim()
      if (!slug) return null
      return relationTo === 'articles' ? articlePagePath(slug) : projectPagePath(slug)
    }
  }
  return null
}

const fallbackSlugFromTitle = (title: string, id: number | string): string => {
  const clean = title
    .trim()
    .toLowerCase()
    .replace(/['"`]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return clean || `form-${id}`
}

export const mapPublicForm = (doc: Partial<Form>): PublicCmsForm | null => {
  if (doc.id === undefined || doc.id === null) return null
  const title = doc.title?.trim()
  if (!title) return null

  const slug = doc.slug?.trim() || fallbackSlugFromTitle(title, doc.id)
  const fields: PublicCmsFormField[] = []

  for (const [index, raw] of (doc.fields ?? []).entries()) {
    if (!raw || typeof raw !== 'object' || !('blockType' in raw)) continue
    const fallbackId = raw.id || `${slug}-field-${index}`

    if (raw.blockType === 'message') {
      if (raw.message) {
        fields.push({
          blockType: 'message',
          id: fallbackId,
          message: raw.message,
        })
      }
      continue
    }

    const name = raw.name?.trim()
    if (!name) continue
    const label = raw.label?.trim() || name
    const width = normalizeWidth(raw.width)
    const required = Boolean(raw.required)

    switch (raw.blockType) {
      case 'text':
      case 'textarea':
        fields.push({
          blockType: raw.blockType,
          id: fallbackId,
          name,
          label,
          width,
          required,
          defaultValue: raw.defaultValue ?? '',
        })
        break
      case 'email':
        fields.push({
          blockType: 'email',
          id: fallbackId,
          name,
          label,
          width,
          required,
          defaultValue: '',
        })
        break
      case 'number':
        fields.push({
          blockType: 'number',
          id: fallbackId,
          name,
          label,
          width,
          required,
          defaultValue:
            typeof raw.defaultValue === 'number' && Number.isFinite(raw.defaultValue)
              ? String(raw.defaultValue)
              : '',
        })
        break
      case 'checkbox':
        fields.push({
          blockType: 'checkbox',
          id: fallbackId,
          name,
          label,
          width,
          required,
          defaultChecked: Boolean(raw.defaultValue),
        })
        break
      case 'select':
        fields.push({
          blockType: 'select',
          id: fallbackId,
          name,
          label,
          width,
          required,
          defaultValue: raw.defaultValue ?? '',
          ...(raw.placeholder?.trim() ? { placeholder: raw.placeholder.trim() } : {}),
          options: (raw.options ?? [])
            .filter((opt) => Boolean(opt?.value?.trim()))
            .map((opt) => ({
              label: opt.label?.trim() || opt.value.trim(),
              value: opt.value.trim(),
            })),
        })
        break
      default:
        break
    }
  }

  return {
    id: doc.id,
    slug,
    title,
    submitButtonLabel: doc.submitButtonLabel?.trim() || 'Send Message',
    confirmationType: doc.confirmationType === 'redirect' ? 'redirect' : 'message',
    confirmationMessage: doc.confirmationMessage ?? null,
    redirectHref: resolveRedirectHref(doc.redirect),
    fields,
  }
}
