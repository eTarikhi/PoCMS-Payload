import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { governedEntities } from '@/access/permissions'
import { CmsFormSection } from '@/app/(frontend)/components/contact/CmsFormSection'
import { PUBLIC_FORM_SELECT } from '@/app/(frontend)/lib/forms-cache'
import { mapPublicForm } from '@/app/(frontend)/lib/forms-types'
import { buildContactPageJsonLd, buildContactPageMetadata } from '@/app/(frontend)/lib/seo'
import config from '@/payload.config'
import type { Form } from '@/payload-types'
import {
  DEFAULT_CONTACT_FORM_SLUG,
  DEFAULT_REQUEST_CV_FORM_SLUG,
  FORM_SUBMISSIONS_COLLECTION,
  FORMS_COLLECTION,
  prepareFormNotificationEmails,
  slugifyFormTitle,
  summarizeSubmissionData,
  validateAndNormalizeSubmission,
} from '@/plugins/formBuilder'
import { formsData } from '@/seed/forms'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const makeReq = (user: unknown = null) =>
  ({
    user,
    payload: {
      config: { admin: { user: 'users' } },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    },
  }) as never

describe('3.2 — @payloadcms/plugin-form-builder (RBAC, Anti-Spam, Seed & /contact Pipeline)', () => {
  it('registers forms and form-submissions in payload.config and syncs Roles RBAC levels', async () => {
    const sanitized = await config

    const formsCol = sanitized.collections.find((c) => c.slug === FORMS_COLLECTION)
    const submissionsCol = sanitized.collections.find((c) => c.slug === FORM_SUBMISSIONS_COLLECTION)
    const rolesCol = sanitized.collections.find((c) => c.slug === 'roles')

    expect(formsCol).toBeDefined()
    expect(submissionsCol).toBeDefined()
    expect(rolesCol).toBeDefined()

    // Ensure governedEntities matches the generated levels group on Roles
    const entities = governedEntities(sanitized)
    const entitySlugs = entities.map((e) => e.slug)
    expect(entitySlugs).toContain(FORMS_COLLECTION)
    expect(entitySlugs).toContain(FORM_SUBMISSIONS_COLLECTION)

    const levelsGroup = rolesCol?.fields.find(
      (f) => 'name' in f && f.name === 'levels' && f.type === 'group',
    )
    expect(levelsGroup).toBeDefined()
    if (levelsGroup && 'fields' in levelsGroup) {
      const roleFieldNames = levelsGroup.fields.flatMap((row) =>
        'fields' in row
          ? row.fields
              .map((sub) => ('name' in sub ? sub.name : null))
              .filter((n): n is string => Boolean(n))
          : 'name' in row && typeof row.name === 'string'
            ? [row.name]
            : [],
      )
      expect(roleFieldNames).toContain('forms')
      expect(roleFieldNames).toContain('formSubmissions')
    }
  })

  it('enforces strict RBAC on forms, private emails field access, and immutable form-submissions', async () => {
    const sanitized = await config
    const formsCol = sanitized.collections.find((c) => c.slug === FORMS_COLLECTION)!
    const submissionsCol = sanitized.collections.find(
      (c) => c.slug === FORM_SUBMISSIONS_COLLECTION,
    )!

    const anonReq = makeReq(null)
    const unprivilegedUserReq = makeReq({
      id: 10,
      collection: 'users',
      permissions: { fullAccess: false, roles: ['Viewer'], levels: {}, capabilities: [] },
    })
    const formReaderReq = makeReq({
      id: 11,
      collection: 'users',
      permissions: {
        fullAccess: false,
        roles: ['Inbox Triage'],
        levels: { forms: 'read', 'form-submissions': 'read' },
        capabilities: [],
      },
    })
    const adminReq = makeReq({
      id: 1,
      collection: 'users',
      permissions: { fullAccess: true, roles: ['Administrator'], levels: {}, capabilities: [] },
    })

    // Forms collection access: public schema read, RBAC-gated mutations
    expect(formsCol.access?.read?.({ req: anonReq } as never)).toBe(true)
    expect(formsCol.access?.create?.({ req: anonReq } as never)).toBe(false)
    expect(formsCol.access?.update?.({ req: unprivilegedUserReq } as never)).toBe(false)
    expect(formsCol.access?.create?.({ req: adminReq } as never)).toBe(true)

    // Private `emails` field read access: hidden from anonymous AND unprivileged users
    const emailsField = formsCol.fields.find(
      (f) => 'name' in f && f.name === 'emails' && f.type === 'array',
    )
    expect(emailsField).toBeDefined()
    if (emailsField && 'access' in emailsField) {
      expect(emailsField.access?.read?.({ req: anonReq } as never)).toBe(false)
      expect(emailsField.access?.read?.({ req: unprivilegedUserReq } as never)).toBe(false)
      expect(emailsField.access?.read?.({ req: formReaderReq } as never)).toBe(true)
      expect(emailsField.access?.read?.({ req: adminReq } as never)).toBe(true)
    }

    // PUBLIC_FORM_SELECT never selects `emails` into Next.js server caches
    expect('emails' in PUBLIC_FORM_SELECT).toBe(false)

    // Form Submissions access: write-only for public, private read, immutable update (false even for admin), full-only delete
    expect(submissionsCol.access?.create?.({ req: anonReq } as never)).toBe(true)
    expect(submissionsCol.access?.read?.({ req: anonReq } as never)).toBe(false)
    expect(submissionsCol.access?.read?.({ req: unprivilegedUserReq } as never)).toBe(false)
    expect(submissionsCol.access?.read?.({ req: formReaderReq } as never)).toBe(true)
    expect(submissionsCol.access?.update?.({ req: adminReq } as never)).toBe(false)
    expect(submissionsCol.access?.delete?.({ req: formReaderReq } as never)).toBe(false)
    expect(submissionsCol.access?.delete?.({ req: adminReq } as never)).toBe(true)
  })

  it('rejects honeypot spam, validates required & email fields, strips blank optionals, and summarizes senders', () => {
    expect(slugifyFormTitle('Request CV!')).toBe('request-cv')

    const formFields = [
      { blockType: 'text', name: 'name', label: 'Full Name', required: true },
      { blockType: 'email', name: 'email', label: 'Work Email', required: true },
      { blockType: 'textarea', name: 'notes', label: 'Notes', required: false },
    ]

    // Honeypot trap rejection
    expect(() =>
      validateAndNormalizeSubmission({
        submissionData: [
          { field: 'name', value: 'Bot' },
          { field: 'email', value: 'bot@spam.example' },
          { field: '_gotcha', value: 'https://spam.example' },
        ],
        formFields,
      }),
    ).toThrow(/Spam submission rejected/i)

    // Missing required field rejection
    expect(() =>
      validateAndNormalizeSubmission({
        submissionData: [{ field: 'name', value: 'Jane Doe' }],
        formFields,
      }),
    ).toThrow(/"Work Email" is required/i)

    // Invalid email rejection
    expect(() =>
      validateAndNormalizeSubmission({
        submissionData: [
          { field: 'name', value: 'Jane Doe' },
          { field: 'email', value: 'not-an-email' },
        ],
        formFields,
      }),
    ).toThrow(/must be a valid email address/i)

    // Valid submission strips empty optional + empty honeypot and builds sender summary
    const valid = validateAndNormalizeSubmission({
      submissionData: [
        { field: 'name', value: '  Jane Doe  ' },
        { field: 'email', value: 'jane@example.com' },
        { field: 'notes', value: '   ' },
        { field: '_gotcha', value: '' },
      ],
      formFields,
    })

    expect(valid.submittedBySummary).toBe('Jane Doe <jane@example.com>')
    expect(valid.normalizedData).toEqual([
      { field: 'name', value: 'Jane Doe' },
      { field: 'email', value: 'jane@example.com' },
    ])
    expect(summarizeSubmissionData([{ field: 'topic', value: 'Architecture review' }])).toBe(
      'topic: Architecture review',
    )
  })

  it('guards Resend email dispatch when RESEND_API_KEY is unset and preserves emails when configured', async () => {
    const sampleEmails = [
      {
        to: 'dev@vtarikhi.com',
        from: 'PoCMS <dev@vtarikhi.com>',
        subject: '[PoCMS Contact] Jane Doe',
        html: '<div>Hello</div>',
      },
    ]

    const prevKey = process.env.RESEND_API_KEY
    const prevPw = process.env.PLAYWRIGHT_TEST
    try {
      delete process.env.PLAYWRIGHT_TEST
      process.env.RESEND_API_KEY = ''
      expect(await prepareFormNotificationEmails(sampleEmails as never, {} as never)).toEqual([])

      process.env.RESEND_API_KEY = 're_test_123456'
      const prepared = await prepareFormNotificationEmails(sampleEmails as never, {} as never)
      expect(prepared).toHaveLength(1)
      expect(prepared[0]).toMatchObject({
        to: 'dev@vtarikhi.com',
        subject: '[PoCMS Contact] Jane Doe',
      })

      // Skips Resend network dispatch when `x-playwright-e2e: 1` or `PLAYWRIGHT_TEST=true` is set
      expect(
        await prepareFormNotificationEmails(sampleEmails as never, {
          req: { headers: new Headers({ 'x-playwright-e2e': '1' }) },
        } as never),
      ).toEqual([])

      process.env.PLAYWRIGHT_TEST = 'true'
      expect(await prepareFormNotificationEmails(sampleEmails as never, {} as never)).toEqual([])
    } finally {
      if (prevKey === undefined) {
        delete process.env.RESEND_API_KEY
      } else {
        process.env.RESEND_API_KEY = prevKey
      }
      if (prevPw === undefined) {
        delete process.env.PLAYWRIGHT_TEST
      } else {
        process.env.PLAYWRIGHT_TEST = prevPw
      }
    }
  })

  it('maps seeded Contact & Request-CV forms without exposing emails and submits interactively via CmsFormSection', async () => {
    const seeded = formsData()
    expect(seeded.map((f) => f.slug)).toEqual([
      DEFAULT_CONTACT_FORM_SLUG,
      DEFAULT_REQUEST_CV_FORM_SLUG,
    ])

    const publicForms = seeded
      .map((doc, idx) => mapPublicForm({ ...(doc as unknown as Partial<Form>), id: idx + 1 }))
      .filter((f): f is NonNullable<typeof f> => f !== null)

    expect(publicForms).toHaveLength(2)
    expect('emails' in publicForms[0]!).toBe(false)

    // Verify /contact SEO & Schema.org ContactPage builders
    const meta = buildContactPageMetadata(undefined, 'https://vtarikhi.com')
    expect(meta.alternates?.canonical).toBe('https://vtarikhi.com/contact')
    expect(buildContactPageJsonLd(undefined, 'https://vtarikhi.com')['@type']).toBe('ContactPage')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ doc: { id: 99 } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(
      React.createElement(CmsFormSection, {
        forms: publicForms,
        ownerName: 'Amir v.Tarikhi',
      }),
    )

    // Switch between Contact Inquiry and Request CV tabs
    const requestCvTab = screen.getByRole('tab', { name: 'Request CV' })
    fireEvent.click(requestCvTab)
    expect(screen.getByRole('form', { name: 'Request CV' })).toBeDefined()

    // Submit empty required fields triggers accessible inline error without calling fetch
    fireEvent.click(screen.getByRole('button', { name: 'Request CV Copy' }))
    expect(await screen.findByText('"Full Name" is required.')).toBeDefined()
    expect(fetchSpy).not.toHaveBeenCalled()

    // Fill fields and submit cleanly to /api/form-submissions
    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Ada Lovelace' },
    })
    fireEvent.change(screen.getByLabelText(/Work Email/i), {
      target: { value: 'ada@analytical.engine' },
    })
    fireEvent.change(screen.getByLabelText(/Company \/ Role/i), {
      target: { value: 'Analytical Engine Lead' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Request CV Copy' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0]!
    expect(calledUrl).toBe('/api/form-submissions')
    const parsedBody = JSON.parse(String(calledInit?.body))
    expect(parsedBody).toEqual({
      form: 2,
      submissionData: [
        { field: 'name', value: 'Ada Lovelace' },
        { field: 'email', value: 'ada@analytical.engine' },
        { field: 'organization', value: 'Analytical Engine Lead' },
      ],
    })

    expect(await screen.findByRole('status')).toBeDefined()
    expect(screen.getByText(/Submission received/i)).toBeDefined()
  })
})
