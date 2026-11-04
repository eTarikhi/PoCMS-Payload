'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react'

import { HeaderBackground } from '@/app/(frontend)/components/headers/HeaderBackground'
import { RichTextContent } from '@/app/(frontend)/components/richtext/RichTextContent'
import type { PublicCmsForm, PublicCmsFormField } from '@/app/(frontend)/lib/forms-types'
import type {
  FooterContent,
  HeaderAccentTone,
  HeaderBackgroundPreset,
} from '@/app/(frontend)/lib/types'

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
  const stageRef = useRef<HTMLElement | null>(null)

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

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const el = stageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 100)
    el.style.setProperty('--spot-x', `${x}%`)
    el.style.setProperty('--spot-y', `${y}%`)
  }

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
      setSubmitError(
        'Network error while submitting the form. Please check your connection and retry.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderFieldControl = (field: Exclude<PublicCmsFormField, { blockType: 'message' }>) => {
    const inputId = `cms-form-${activeForm?.slug ?? 'default'}-${field.name}`
    const errorId = `${inputId}-error`
    const errorMsg = fieldErrors[field.name]

    if (field.blockType === 'checkbox') {
      return (
        <div className="pocms-contact-field-group">
          <label htmlFor={inputId} className="pocms-contact-checkbox-label">
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
              className="pocms-contact-checkbox"
            />
            <span>
              {field.label}
              {field.required ? (
                <span className="pocms-contact-req" aria-hidden="true">
                  *
                </span>
              ) : null}
            </span>
          </label>
          {errorMsg ? (
            <p id={errorId} className="pocms-contact-error">
              {errorMsg}
            </p>
          ) : null}
        </div>
      )
    }

    return (
      <div className="pocms-contact-field-group">
        <label htmlFor={inputId} className="pocms-contact-label">
          {field.label}
          {field.required ? (
            <span className="pocms-contact-req" aria-hidden="true">
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
            className="pocms-contact-textarea"
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
            className="pocms-contact-select"
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
            className="pocms-contact-input"
          />
        )}

        {errorMsg ? (
          <p id={errorId} className="pocms-contact-error">
            {errorMsg}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="pocms-subpage-shell" data-accent-tone={accentTone}>
      <header
        ref={stageRef}
        className="pocms-header-stage"
        data-header-type="archive"
        data-accent-tone={accentTone}
        onPointerMove={handlePointerMove}
      >
        <HeaderBackground preset={backgroundPreset} />

        <div className="pocms-hub-container pocms-header-stage__inner">
          <div className="pocms-topbar">
            <nav aria-label="Breadcrumb">
              <ol className="pocms-breadcrumbs">
                <li>
                  <Link href="/">← Home</Link>
                </li>
                <li className="pocms-breadcrumbs__sep" aria-hidden="true">
                  /
                </li>
                <li className="pocms-breadcrumbs__current" aria-current="page">
                  Contact
                </li>
              </ol>
            </nav>

            <div className="pocms-topbar__actions">
              {forms.length > 0 ? (
                <span className="pocms-telemetry-pill">
                  <strong>{forms.length}</strong> {forms.length === 1 ? 'Channel' : 'Channels'}
                </span>
              ) : null}
              <Link href="/projects" className="pocms-utility-btn">
                Projects →
              </Link>
              <Link href="/articles" className="pocms-utility-btn">
                Articles →
              </Link>
            </div>
          </div>

          <div className="pocms-stage-copy">
            <div className="pocms-eyebrow-row">
              <span className="pocms-eyebrow">Direct &amp; Private Channel</span>
            </div>
            <h1 className="pocms-stage-title">Contact &amp; Request CV</h1>
            <p className="pocms-stage-subtitle">
              Reach out to {ownerName} regarding software architecture, consulting engagements, or
              request an up-to-date CV copy. Submissions are stored securely in Payload CMS without
              exposing private inbox addresses.
            </p>
          </div>

          {forms.length > 1 ? (
            <div className="pocms-contact-dock">
              <div
                role="tablist"
                aria-label="Choose inquiry type"
                className="pocms-filter-pills"
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
                      className={`pocms-pill-btn${selected ? ' is-active' : ''}`}
                    >
                      {form.title}
                    </button>
                  )
                })}
              </div>
              <span className="pocms-contact-dock__hint">
                Active form: <strong>{activeForm?.title}</strong>
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="pocms-inner-main">
        <div className="pocms-hub-container">
          <div className="pocms-contact-grid">
            <div className="pocms-contact-card">
              {!activeForm ? (
                <div className="pocms-contact-empty">
                  <h2 className="pocms-contact-empty__title">Contact form is being configured</h2>
                  <p className="pocms-contact-empty__body">
                    Create or publish a form under <strong>Admin › Content › Forms</strong> to start
                    receiving submissions on this page.
                  </p>
                </div>
              ) : isSubmitted ? (
                <div role="status" aria-live="polite" className="pocms-contact-success">
                  <h2 className="pocms-contact-success__title">Submission received</h2>
                  <div className="pocms-contact-success__body">
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
                    className="pocms-btn-ghost pocms-contact-success__reset"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form aria-label={activeForm.title} noValidate onSubmit={handleSubmit}>
                  <div className="pocms-contact-card__header">
                    <h2 className="pocms-contact-card__title">{activeForm.title}</h2>
                    <p className="pocms-contact-card__meta">
                      Fields marked with <span className="pocms-contact-req">*</span> are required.
                    </p>
                  </div>

                  {submitError ? (
                    <div role="alert" className="pocms-contact-alert">
                      {submitError}
                    </div>
                  ) : null}

                  <div className="pocms-contact-fields-grid">
                    {activeForm.fields.map((field) => {
                      if (field.blockType === 'message') {
                        return (
                          <div
                            key={field.id}
                            className="pocms-contact-field--full pocms-contact-message-block"
                          >
                            <RichTextContent data={field.message} />
                          </div>
                        )
                      }

                      const spanHalf = field.width <= 55
                      return (
                        <div
                          key={field.id}
                          className={
                            spanHalf ? 'pocms-contact-field--half' : 'pocms-contact-field--full'
                          }
                        >
                          {renderFieldControl(field)}
                        </div>
                      )
                    })}
                  </div>

                  {/* Anti-spam honeypot field hidden off-screen from visual layout, assistive tech, and tab order */}
                  <div aria-hidden="true" className="pocms-contact-honeypot">
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

                  <div className="pocms-contact-footer">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="pocms-btn-gold pocms-contact-submit"
                    >
                      {isSubmitting ? 'Sending…' : activeForm.submitButtonLabel}
                    </button>
                    <span className="pocms-contact-security-note">
                      Protected against automated scraping &amp; spam.
                    </span>
                  </div>
                </form>
              )}
            </div>

            <aside aria-label="Contact details" className="pocms-contact-rail">
              <div className="pocms-contact-rail-card">
                <div className="pocms-contact-rail__section">
                  <h2 className="pocms-contact-rail__heading">How this channel works</h2>
                  <p className="pocms-contact-rail__text">
                    Every form on this page is managed in Payload CMS with strict role-based access
                    control. Submissions are stored in an immutable inbox and trigger private Resend
                    notifications without exposing destination addresses to bots.
                  </p>
                </div>

                {(footer?.profiles && footer.profiles.length > 0) ||
                (footer?.socialLinks && footer.socialLinks.length > 0) ? (
                  <div className="pocms-contact-rail__section">
                    <h3 className="pocms-contact-rail__kicker">Elsewhere Online</h3>
                    <ul className="pocms-contact-profile-list">
                      {footer?.profiles && footer.profiles.length > 0
                        ? footer.profiles.map((profile) => (
                            <li key={profile.url}>
                              <a
                                href={profile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pocms-btn-ghost"
                              >
                                {profile.name} ↗
                              </a>
                            </li>
                          ))
                        : footer?.socialLinks.map((social) => (
                            <li key={social.url}>
                              <a
                                href={social.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pocms-btn-ghost"
                              >
                                {social.ariaLabel} ↗
                              </a>
                            </li>
                          ))}
                    </ul>
                  </div>
                ) : null}

                <div className="pocms-contact-rail__section">
                  <h3 className="pocms-contact-rail__kicker">Explore Portfolio</h3>
                  <ul className="pocms-contact-nav-list">
                    <li>
                      <Link href="/projects" className="pocms-contact-nav-link">
                        <span>Browse Case Studies &amp; Projects</span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="/articles" className="pocms-contact-nav-link">
                        <span>Read Technical Articles &amp; Notes</span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
