'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { HeaderBackground } from '@/app/(frontend)/components/headers/HeaderBackground'
import { RichTextContent } from '@/app/(frontend)/components/richtext/RichTextContent'
import type { PublicCmsForm, PublicCmsFormField } from '@/app/(frontend)/lib/forms-types'
import type { FooterContent, HeaderBackgroundPreset, HeaderAccentTone } from '@/app/(frontend)/lib/types'

export type CmsFormSectionProps = {
  forms: PublicCmsForm[]
  initialFormSlug?: string
  ownerName: string
  footer?: FooterContent | null
  backgroundPreset?: HeaderBackgroundPreset
  accentTone?: HeaderAccentTone
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const buildInitialValues = (form: PublicCmsForm | undefined): Record<string, string | boolean> => {
  const initial: Record<string, string | boolean> = {}
  if (!form) return initial
  for (const field of form.fields) {
    if (field.blockType === 'message') continue
    if (field.blockType === 'checkbox') {
      initial[field.name] = field.defaultChecked
    } else if (field.blockType === 'select') {
      initial[field.name] = field.defaultValue || field.options[0]?.value || ''
    } else {
      initial[field.name] = field.defaultValue || ''
    }
  }
  return initial
}

export function CmsFormSection({
  forms,
  initialFormSlug,
  ownerName,
  footer,
  backgroundPreset = 'blueprint-spotlight',
  accentTone = 'gold-copper',
}: CmsFormSectionProps) {
  const router = useRouter()

  const defaultSlug = useMemo(() => {
    if (initialFormSlug) {
      const matched = forms.find((f) => f.slug === initialFormSlug)
      if (matched) return matched.slug
    }
    return forms[0]?.slug ?? ''
  }, [forms, initialFormSlug])

  const [activeSlug, setActiveSlug] = useState<string>(defaultSlug)
  const activeForm = useMemo(
    () => forms.find((f) => f.slug === activeSlug) ?? forms[0],
    [forms, activeSlug],
  )

  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    buildInitialValues(activeForm),
  )
  const [honeypot, setHoneypot] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSelectForm = (slug: string) => {
    const nextForm = forms.find((f) => f.slug === slug) ?? forms[0]
    setActiveSlug(slug)
    setValues(buildInitialValues(nextForm))
    setHoneypot('')
    setFieldErrors({})
    setSubmitError(null)
    setIsSubmitted(false)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (slug === forms[0]?.slug) {
        url.searchParams.delete('form')
      } else {
        url.searchParams.set('form', slug)
      }
      window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    }
  }

  const validateClientFields = (form: PublicCmsForm): Record<string, string> => {
    const errors: Record<string, string> = {}
    for (const field of form.fields) {
      if (field.blockType === 'message') continue
      const current = values[field.name]

      if (field.blockType === 'checkbox') {
        if (field.required && current !== true) {
          errors[field.name] = `Please confirm "${field.label}".`
        }
        continue
      }

      const str = typeof current === 'string' ? current.trim() : ''
      if (field.required && str.length === 0) {
        errors[field.name] = `"${field.label}" is required.`
        continue
      }
      if (field.blockType === 'email' && str.length > 0 && !EMAIL_REGEX.test(str)) {
        errors[field.name] = 'Please enter a valid email address.'
      }
    }
    return errors
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeForm || isSubmitting) return

    const clientErrors = validateClientFields(activeForm)
    setFieldErrors(clientErrors)
    setSubmitError(null)

    if (Object.keys(clientErrors).length > 0) return

    const submissionData: Array<{ field: string; value: string }> = []
    for (const field of activeForm.fields) {
      if (field.blockType === 'message') continue
      const raw = values[field.name]
      if (field.blockType === 'checkbox') {
        if (raw === true || field.required) {
          submissionData.push({ field: field.name, value: raw === true ? 'true' : 'false' })
        }
        continue
      }
      const trimmed = typeof raw === 'string' ? raw.trim() : ''
      if (trimmed.length > 0) {
        submissionData.push({ field: field.name, value: trimmed })
      }
    }

    if (honeypot.trim().length > 0) {
      submissionData.push({ field: '_gotcha', value: honeypot.trim() })
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          form: activeForm.id,
          submissionData,
        }),
      })

      if (!response.ok) {
        let message = 'Unable to send your message right now. Please try again.'
        try {
          const payloadErr = (await response.json()) as {
            errors?: Array<{ message?: string }>
            message?: string
          }
          const firstMessage = payloadErr?.errors?.[0]?.message || payloadErr?.message
          if (firstMessage) message = firstMessage
        } catch {
          // Ignore malformed error body
        }
        setSubmitError(message)
        return
      }

      if (activeForm.confirmationType === 'redirect' && activeForm.redirectHref) {
        router.push(activeForm.redirectHref)
        return
      }

      setIsSubmitted(true)
    } catch {
      setSubmitError('Network error while submitting the form. Please check your connection and retry.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderFieldControl = (field: Exclude<PublicCmsFormField, { blockType: 'message' }>) => {
    const inputId = `cms-form-${activeForm?.slug ?? 'default'}-${field.name}`
    const errorId = `${inputId}-error`
    const errorMsg = fieldErrors[field.name]
    const baseInputClass =
      'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 shadow-xs transition placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 dark:placeholder:text-zinc-400'

    if (field.blockType === 'checkbox') {
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="inline-flex cursor-pointer items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
            <input
              id={inputId}
              name={field.name}
              type="checkbox"
              checked={Boolean(values[field.name])}
              required={field.required}
              aria-required={field.required}
              aria-invalid={Boolean(errorMsg)}
              aria-describedby={errorMsg ? errorId : undefined}
              onChange={(e) => {
                setValues((prev) => ({ ...prev, [field.name]: e.target.checked }))
                if (errorMsg) {
                  setFieldErrors((prev) => {
                    const next = { ...prev }
                    delete next[field.name]
                    return next
                  })
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-900"
            />
            <span>
              {field.label}
              {field.required ? <span className="ml-1 text-amber-700 dark:text-amber-400">*</span> : null}
            </span>
          </label>
          {errorMsg ? (
            <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-400">
              {errorMsg}
            </p>
          ) : null}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
        >
          {field.label}
          {field.required ? (
            <span className="ml-1 text-amber-700 dark:text-amber-400" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>

        {field.blockType === 'textarea' ? (
          <textarea
            id={inputId}
            name={field.name}
            rows={5}
            value={typeof values[field.name] === 'string' ? (values[field.name] as string) : ''}
            required={field.required}
            aria-required={field.required}
            aria-invalid={Boolean(errorMsg)}
            aria-describedby={errorMsg ? errorId : undefined}
            onChange={(e) => {
              const nextVal = e.target.value
              setValues((prev) => ({ ...prev, [field.name]: nextVal }))
              if (errorMsg) {
                setFieldErrors((prev) => {
                  const next = { ...prev }
                  delete next[field.name]
                  return next
                })
              }
            }}
            className={`${baseInputClass} resize-y`}
          />
        ) : field.blockType === 'select' ? (
          <select
            id={inputId}
            name={field.name}
            value={typeof values[field.name] === 'string' ? (values[field.name] as string) : ''}
            required={field.required}
            aria-required={field.required}
            aria-invalid={Boolean(errorMsg)}
            aria-describedby={errorMsg ? errorId : undefined}
            onChange={(e) => {
              const nextVal = e.target.value
              setValues((prev) => ({ ...prev, [field.name]: nextVal }))
              if (errorMsg) {
                setFieldErrors((prev) => {
                  const next = { ...prev }
                  delete next[field.name]
                  return next
                })
              }
            }}
            className={baseInputClass}
          >
            {field.placeholder ? <option value="">{field.placeholder}</option> : null}
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            name={field.name}
            type={field.blockType}
            value={typeof values[field.name] === 'string' ? (values[field.name] as string) : ''}
            required={field.required}
            aria-required={field.required}
            aria-invalid={Boolean(errorMsg)}
            aria-describedby={errorMsg ? errorId : undefined}
            onChange={(e) => {
              const nextVal = e.target.value
              setValues((prev) => ({ ...prev, [field.name]: nextVal }))
              if (errorMsg) {
                setFieldErrors((prev) => {
                  const next = { ...prev }
                  delete next[field.name]
                  return next
                })
              }
            }}
            className={baseInputClass}
          />
        )}

        {errorMsg ? (
          <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-400">
            {errorMsg}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-h-[70vh]">
      {/* Subpage Header matching /articles and /projects */}
      <header
        data-accent={accentTone}
        className="pocms-hub-header relative overflow-hidden border-b border-zinc-200/80 bg-zinc-50/90 py-12 dark:border-zinc-800/80 dark:bg-zinc-950/90 md:py-16"
      >
        <HeaderBackground preset={backgroundPreset} />
        <div className="pocms-hub-container relative z-10">
          <nav
            aria-label="Breadcrumb"
            className="mb-6 flex flex-wrap items-center justify-between gap-4 text-sm text-zinc-600 dark:text-zinc-400"
          >
            <ol className="flex items-center gap-2">
              <li>
                <Link
                  href="/"
                  className="font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="font-semibold text-zinc-900 dark:text-zinc-100" aria-current="page">
                Contact
              </li>
            </ol>

            <div className="flex items-center gap-4">
              <Link
                href="/projects"
                className="font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
              >
                Projects →
              </Link>
              <Link
                href="/articles"
                className="font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
              >
                Articles →
              </Link>
            </div>
          </nav>

          <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-amber-800 uppercase dark:text-amber-300">
            Direct &amp; Private Channel
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl md:text-5xl dark:text-zinc-50">
            Contact &amp; Request CV
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Reach out to {ownerName} regarding software architecture, consulting engagements, or
            request an up-to-date CV copy. Submissions are stored securely in Payload CMS without
            exposing private inbox addresses.
          </p>

          {forms.length > 1 ? (
            <div
              role="tablist"
              aria-label="Choose inquiry type"
              className="mt-8 inline-flex flex-wrap gap-2 rounded-2xl border border-zinc-200/90 bg-white/90 p-1.5 shadow-xs backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90"
            >
              {forms.map((form) => {
                const selected = form.slug === activeForm?.slug
                return (
                  <button
                    key={form.slug}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => handleSelectForm(form.slug)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      selected
                        ? 'bg-zinc-900 text-white shadow-xs dark:bg-amber-400 dark:text-zinc-950'
                        : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'
                    }`}
                  >
                    {form.title}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </header>

      {/* Main 2-column Workspace */}
      <section className="pocms-hub-container py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-8">
            <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xs sm:p-8 dark:border-zinc-800 dark:bg-zinc-900/60">
              {!activeForm ? (
                <div className="py-8 text-center">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Contact form is being configured
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    Create or publish a form under <strong>Admin › Content › Forms</strong> to start
                    receiving submissions on this page.
                  </p>
                </div>
              ) : isSubmitted ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-50/70 p-6 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                >
                  <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-200">
                    Submission received
                  </h2>
                  <div className="mt-3 text-sm leading-relaxed text-emerald-900 dark:text-emerald-100">
                    {activeForm.confirmationMessage ? (
                      <RichTextContent data={activeForm.confirmationMessage} />
                    ) : (
                      <p>Thank you — your submission has been recorded and I will respond soon.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setValues(buildInitialValues(activeForm))
                      setIsSubmitted(false)
                    }}
                    className="mt-6 inline-flex items-center rounded-xl border border-emerald-700/30 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100/70 dark:border-emerald-400/30 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-zinc-800"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form
                  aria-label={activeForm.title}
                  noValidate
                  onSubmit={handleSubmit}
                  className="space-y-6"
                >
                  <div className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
                    <h2 className="text-xl font-bold text-zinc-950 dark:text-zinc-50">
                      {activeForm.title}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      Fields marked with <span className="text-amber-700 dark:text-amber-400">*</span> are required.
                    </p>
                  </div>

                  {submitError ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-500/40 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200"
                    >
                      {submitError}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {activeForm.fields.map((field) => {
                      if (field.blockType === 'message') {
                        return (
                          <div
                            key={field.id}
                            className="md:col-span-2 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
                          >
                            <RichTextContent data={field.message} />
                          </div>
                        )
                      }

                      const spanHalf = field.width <= 55
                      return (
                        <div
                          key={field.id}
                          className={spanHalf ? 'md:col-span-1' : 'md:col-span-2'}
                        >
                          {renderFieldControl(field)}
                        </div>
                      )
                    })}
                  </div>

                  {/* Anti-spam honeypot field hidden from assistive technology and keyboard tab order */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
                  >
                    <label htmlFor={`cms-hp-${activeForm.slug}`}>Leave this field blank</label>
                    <input
                      id={`cms-hp-${activeForm.slug}`}
                      name="_gotcha"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-400 dark:text-zinc-950 dark:hover:bg-amber-300"
                    >
                      {isSubmitting ? 'Sending…' : activeForm.submitButtonLabel}
                    </button>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      Protected against automated scraping &amp; spam.
                    </span>
                  </div>
                </form>
              )}
            </div>
          </div>

          <aside aria-label="Contact details" className="lg:col-span-4">
            <div className="space-y-6 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div>
                <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-100">
                  How this channel works
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  Every form on this page is managed in Payload CMS with strict role-based access
                  control. Submissions are stored in an immutable inbox and trigger private Resend
                  notifications without exposing destination addresses to bots.
                </p>
              </div>

              {(footer?.profiles && footer.profiles.length > 0) ||
              (footer?.socialLinks && footer.socialLinks.length > 0) ? (
                <div className="border-t border-zinc-200/80 pt-5 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-400">
                    Elsewhere Online
                  </h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {footer?.profiles && footer.profiles.length > 0
                      ? footer.profiles.map((profile) => (
                          <li key={profile.url}>
                            <a
                              href={profile.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-lg border border-zinc-300/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:border-amber-500 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-400"
                            >
                              {profile.name}
                            </a>
                          </li>
                        ))
                      : footer?.socialLinks.map((social) => (
                          <li key={social.url}>
                            <a
                              href={social.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-lg border border-zinc-300/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:border-amber-500 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-400"
                            >
                              {social.ariaLabel}
                            </a>
                          </li>
                        ))}
                  </ul>
                </div>
              ) : null}

              <div className="border-t border-zinc-200/80 pt-5 dark:border-zinc-800">
                <h3 className="text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-400">
                  Explore Portfolio
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link
                      href="/projects"
                      className="font-medium text-zinc-800 underline-offset-4 hover:underline dark:text-zinc-200"
                    >
                      Browse Case Studies &amp; Projects →
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/articles"
                      className="font-medium text-zinc-800 underline-offset-4 hover:underline dark:text-zinc-200"
                    >
                      Read Technical Articles &amp; Notes →
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
