import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'

type BeforeEmailFn = NonNullable<
  NonNullable<Parameters<typeof formBuilderPlugin>[0]>['beforeEmail']
>
import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type Field,
  type Plugin,
} from 'payload'

import { can } from '@/access/permissions'
import { contentAccess, hiddenWithout } from '@/access/roles'
import { revalidateFormTags } from '@/app/(frontend)/lib/revalidate'

export const FORMS_COLLECTION = 'forms'
export const FORM_SUBMISSIONS_COLLECTION = 'form-submissions'
export const DEFAULT_CONTACT_FORM_SLUG = 'contact'
export const DEFAULT_REQUEST_CV_FORM_SLUG = 'request-cv'

/** Invisible anti-spam trap field names rejected at validation time when filled by bots. */
export const HONEYPOT_FIELD_NAMES = ['_gotcha', '_honeypot', 'website_url_hp'] as const
const HONEYPOT_SET = new Set<string>(HONEYPOT_FIELD_NAMES)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type SubmissionEntry = {
  field?: string | null
  value?: unknown
  id?: string | null
}

export type FormFieldBlockLike = {
  blockType?: string | null
  name?: string | null
  label?: string | null
  required?: boolean | null
}

/** Converts a form title or custom slug into a clean URL-safe identifier (`"Request CV"` -> `"request-cv"`). */
export const slugifyFormTitle = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/['"`]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Extracts a concise human-readable sender summary (`"Jane Doe <jane@example.com>"`) for Admin triage. */
export const summarizeSubmissionData = (
  submissionData: readonly SubmissionEntry[] | null | undefined,
): string => {
  if (!Array.isArray(submissionData) || submissionData.length === 0) return 'Submission'

  const byKey = new Map<string, string>()
  for (const item of submissionData) {
    const key = typeof item?.field === 'string' ? item.field.trim().toLowerCase() : ''
    const val =
      typeof item?.value === 'string'
        ? item.value.trim()
        : item?.value !== null && item?.value !== undefined
          ? String(item.value).trim()
          : ''
    if (key && val && !HONEYPOT_SET.has(key)) {
      byKey.set(key, val)
    }
  }

  const name =
    byKey.get('name') ||
    byKey.get('fullname') ||
    byKey.get('full_name') ||
    byKey.get('full-name') ||
    byKey.get('sender') ||
    ''
  const email =
    byKey.get('email') ||
    byKey.get('workemail') ||
    byKey.get('work_email') ||
    byKey.get('work-email') ||
    ''

  if (name && email) return `${name} <${email}>`
  if (email) return email
  if (name) return name

  const firstEntry = Array.from(byKey.entries())[0]
  if (firstEntry) {
    const snippet = firstEntry[1].slice(0, 60)
    return `${firstEntry[0]}: ${snippet}`
  }
  return 'Submission'
}

/**
 * Validates and normalizes `submissionData` against anti-spam honeypots and the target form's
 * configured field definitions (`required` and `email` blocks).
 */
export const validateAndNormalizeSubmission = ({
  submissionData,
  formFields,
}: {
  submissionData: readonly SubmissionEntry[] | null | undefined
  formFields?: readonly FormFieldBlockLike[] | null
}): {
  normalizedData: Array<{ field: string; value: string; id?: string }>
  submittedBySummary: string
} => {
  if (!Array.isArray(submissionData) || submissionData.length === 0) {
    throw new APIError('Form submission cannot be empty.', 400)
  }

  const normalizedData: Array<{ field: string; value: string; id?: string }> = []
  const submittedMap = new Map<string, string>()

  for (const raw of submissionData) {
    const fieldName = typeof raw?.field === 'string' ? raw.field.trim() : ''
    if (!fieldName) continue

    const rawValue =
      typeof raw?.value === 'string'
        ? raw.value.trim()
        : raw?.value !== null && raw?.value !== undefined
          ? String(raw.value).trim()
          : ''

    if (HONEYPOT_SET.has(fieldName.toLowerCase())) {
      if (rawValue.length > 0) {
        throw new APIError('Spam submission rejected.', 400)
      }
      // Strip empty honeypot entries so they never pollute stored submission rows.
      continue
    }

    if (rawValue.length === 0) {
      // Omit blank optional values because Payload's form-submissions `value` column is `required: true`.
      continue
    }

    submittedMap.set(fieldName, rawValue)
    normalizedData.push({
      field: fieldName,
      value: rawValue,
      ...(typeof raw?.id === 'string' && raw.id ? { id: raw.id } : {}),
    })
  }

  if (Array.isArray(formFields) && formFields.length > 0) {
    for (const block of formFields) {
      if (!block || block.blockType === 'message') continue
      const name = typeof block.name === 'string' ? block.name.trim() : ''
      if (!name) continue
      const label =
        typeof block.label === 'string' && block.label.trim().length > 0
          ? block.label.trim()
          : name
      const value = submittedMap.get(name) ?? ''

      if (block.required && value.length === 0) {
        throw new APIError(`"${label}" is required.`, 400)
      }

      if (block.blockType === 'email' && value.length > 0 && !EMAIL_PATTERN.test(value)) {
        throw new APIError(`"${label}" must be a valid email address.`, 400)
      }
    }
  }

  if (normalizedData.length === 0) {
    throw new APIError('Form submission cannot be empty.', 400)
  }

  return {
    normalizedData,
    submittedBySummary: summarizeSubmissionData(normalizedData),
  }
}

const populateFormSlugHook: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) return data
  const record = data as Record<string, unknown>
  const explicitSlug = typeof record.slug === 'string' ? slugifyFormTitle(record.slug) : ''
  if (explicitSlug) {
    record.slug = explicitSlug
    return data
  }
  const existingSlug =
    typeof (originalDoc as Record<string, unknown> | undefined)?.slug === 'string'
      ? ((originalDoc as Record<string, unknown>).slug as string).trim()
      : ''
  if (existingSlug) {
    record.slug = existingSlug
    return data
  }
  const title = typeof record.title === 'string' ? record.title : ''
  const derived = slugifyFormTitle(title)
  if (derived) {
    record.slug = derived
  }
  return data
}

const revalidateFormsAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc, context }) => {
  if (!context?.skipRevalidate) {
    const slug = typeof doc?.slug === 'string' ? doc.slug : null
    const prevSlug =
      typeof (previousDoc as Record<string, unknown> | undefined)?.slug === 'string'
        ? ((previousDoc as Record<string, unknown>).slug as string)
        : null
    revalidateFormTags(slug, prevSlug)
  }
  return doc
}

const revalidateFormsAfterDelete: CollectionAfterDeleteHook = ({ doc, context }) => {
  if (!context?.skipRevalidate) {
    const slug = typeof doc?.slug === 'string' ? doc.slug : null
    revalidateFormTags(slug)
  }
  return doc
}

const validateFormSubmissionHook: CollectionBeforeValidateHook = async ({ data, req }) => {
  if (!data) return data
  const record = data as Record<string, unknown>

  let formFields: FormFieldBlockLike[] | null = null
  const rawFormRef = record.form
  const formId =
    typeof rawFormRef === 'number' || typeof rawFormRef === 'string'
      ? rawFormRef
      : rawFormRef && typeof rawFormRef === 'object' && 'id' in rawFormRef
        ? (rawFormRef as { id: number | string }).id
        : null

  if (formId !== null && req?.payload) {
    try {
      const formDoc = (await req.payload.findByID({
        collection: FORMS_COLLECTION,
        id: formId,
        depth: 0,
        req,
      })) as { fields?: FormFieldBlockLike[] | null }
      if (Array.isArray(formDoc?.fields)) {
        formFields = formDoc.fields
      }
    } catch {
      // Non-existent form IDs are caught by the plugin's relationship field validator.
    }
  }

  const { normalizedData, submittedBySummary } = validateAndNormalizeSubmission({
    submissionData: record.submissionData as SubmissionEntry[] | undefined,
    formFields,
  })

  record.submissionData = normalizedData
  record.submittedBySummary = submittedBySummary
  return data
}

const markAnonymousSubmissionContextHook: CollectionBeforeChangeHook = ({
  data,
  req,
  context,
  operation,
}) => {
  // Prevent anonymous public form submissions from flooding the admin AuditLogs table,
  // while still auditing authenticated admin mutations/deletions.
  if (operation === 'create' && !req?.user && context) {
    context.skipAuditLog = true
  }
  return data
}

/**
 * Formats outgoing notification emails and skips live Resend network calls when `RESEND_API_KEY`
 * is unset in local development or automated tests.
 */
export const prepareFormNotificationEmails: BeforeEmailFn = (emailsToSend, beforeChangeParams) => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    beforeChangeParams?.req?.payload?.logger?.info?.({
      msg: '[forms] Skipping transactional email dispatch because RESEND_API_KEY is not configured.',
    })
    return []
  }

  return emailsToSend.map((email) => ({
    ...email,
    subject: email.subject?.trim() || 'New portfolio form submission',
  }))
}

/** Tightens the `emails` array read access so recipient targets (`emailTo`, `cc`, `bcc`) stay private. */
const secureFormFields = ({ defaultFields }: { defaultFields: Field[] }): Field[] => {
  const patchedFields = defaultFields.map<Field>((field) => {
    if ('name' in field && field.name === 'emails' && field.type === 'array') {
      return {
        ...field,
        access: {
          ...(field.access ?? {}),
          read: ({ req }) => can(req.user, FORMS_COLLECTION, 'read'),
        },
      }
    }
    return field
  })

  const slugField: Field = {
    name: 'slug',
    type: 'text',
    unique: true,
    index: true,
    admin: {
      position: 'sidebar',
      description:
        'Stable identifier used by frontend routes (e.g. "contact", "request-cv"). Auto-generated from title when left empty.',
    },
  }

  return [...patchedFields, slugField]
}

const extendSubmissionFields = ({ defaultFields }: { defaultFields: Field[] }): Field[] => [
  {
    name: 'submittedBySummary',
    type: 'text',
    index: true,
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: 'Sender summary automatically extracted from submission fields.',
    },
  },
  ...defaultFields,
]

/**
 * Configures `@payloadcms/plugin-form-builder` for CMS-driven Contact & Request-CV forms:
 * - Publicly readable form schemas (`forms`) with private `emails` notification config and RBAC writes.
 * - Write-only public submissions (`form-submissions`) with immutable rows, strict RBAC read/delete,
 *   anti-spam honeypot protection, server-side required/email validation, and Resend email notifications.
 */
export const portfolioFormBuilderPlugin = (): Plugin =>
  formBuilderPlugin({
    fields: {
      text: true,
      textarea: true,
      select: true,
      email: true,
      checkbox: true,
      number: true,
      message: true,
      country: false,
      state: false,
      payment: false,
    },
    redirectRelationships: ['articles', 'projects'],
    defaultToEmail: process.env.CONTACT_NOTIFICATION_EMAIL || 'dev@vtarikhi.com',
    beforeEmail: prepareFormNotificationEmails,
    formOverrides: {
      slug: FORMS_COLLECTION,
      labels: {
        singular: 'Form',
        plural: 'Forms',
      },
      access: contentAccess(FORMS_COLLECTION),
      admin: {
        group: 'Content',
        hidden: hiddenWithout(FORMS_COLLECTION),
        useAsTitle: 'title',
        defaultColumns: ['title', 'slug', 'submitButtonLabel', 'updatedAt'],
        description:
          'CMS-managed interactive forms (Contact Inquiry, Request CV) rendered at /contact without exposing recipient email addresses.',
      },
      fields: secureFormFields,
      hooks: {
        beforeValidate: [populateFormSlugHook],
        afterChange: [revalidateFormsAfterChange],
        afterDelete: [revalidateFormsAfterDelete],
      },
    },
    formSubmissionOverrides: {
      slug: FORM_SUBMISSIONS_COLLECTION,
      labels: {
        singular: 'Form Submission',
        plural: 'Form Submissions',
      },
      access: {
        // Anyone on the public website can submit a form; reading or deleting submissions requires RBAC.
        create: () => true,
        read: ({ req }) => can(req.user, FORM_SUBMISSIONS_COLLECTION, 'read'),
        update: () => false,
        delete: ({ req }) => can(req.user, FORM_SUBMISSIONS_COLLECTION, 'delete'),
      },
      admin: {
        group: 'Content',
        hidden: hiddenWithout(FORM_SUBMISSIONS_COLLECTION),
        useAsTitle: 'submittedBySummary',
        defaultColumns: ['submittedBySummary', 'form', 'createdAt'],
        description:
          'Immutable inbox of visitor Contact and Request-CV form submissions.',
      },
      fields: extendSubmissionFields,
      hooks: {
        beforeValidate: [validateFormSubmissionHook],
        beforeChange: [markAnonymousSubmissionContextHook],
      },
    },
  })
