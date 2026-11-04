'use client'

import { toast } from '@payloadcms/ui'
import { LoaderCircleIcon, PaperclipIcon, SendIcon, SaveIcon, XIcon } from 'lucide-react'
import React, { useRef, useState } from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import {
  Dialog,
  DialogContent,
} from '@/components/admin/elements/Dialog'
import { Input } from '@/components/admin/elements/Input'
import { Label } from '@/components/admin/elements/Label'
import { Textarea } from '@/components/admin/elements/Textarea'
import { MAIL_ATTACHMENTS_COLLECTION } from '@/plugins/mailInbox/constants'
import type {
  MailAttachmentDTO,
  MailInboxIdentity,
  MailMessageDTO,
  MailThreadDetailDTO,
} from '@/plugins/mailInbox/types'

export type ComposeInitialState = {
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  text?: string
  replyToThreadId?: number | string | null
  replyToMessageId?: number | string | null
  draftMessageId?: number | string | null
}

function formatBytesHuman(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ComposeDrawer({
  open,
  onOpenChange,
  apiRoute,
  identities,
  outboundConfigured,
  initial,
  onCompleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiRoute: string
  identities: MailInboxIdentity[]
  outboundConfigured: boolean
  initial?: ComposeInitialState | null
  onCompleted: (result: {
    dispatched: boolean
    message: MailMessageDTO
    thread: MailThreadDetailDTO | null
  }) => void
}) {
  const defaultIdentity = identities.find((i) => i.default) ?? identities[0]
  const [fromEmail, setFromEmail] = useState(defaultIdentity?.email ?? 'dev@vtarikhi.com')
  const [to, setTo] = useState(initial?.to ?? '')
  const [cc, setCc] = useState(initial?.cc ?? '')
  const [bcc, setBcc] = useState(initial?.bcc ?? '')
  const [showCcBcc, setShowCcBcc] = useState(Boolean(initial?.cc || initial?.bcc))
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [text, setText] = useState(initial?.text ?? '')
  const [attachments, setAttachments] = useState<MailAttachmentDTO[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState<'send' | 'draft' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    setUploading(true)
    try {
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append(
          '_payload',
          JSON.stringify({
            originalFilename: file.name,
            disposition: 'attachment',
          }),
        )

        const res = await fetch(`${apiRoute}/${MAIL_ATTACHMENTS_COLLECTION}`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        const json = (await res.json().catch(() => ({}))) as {
          doc?: {
            id: number | string
            filename?: string
            originalFilename?: string
            mimeType?: string
            filesize?: number
            url?: string
          }
          errors?: Array<{ message?: string }>
        }
        if (!res.ok || !json.doc) {
          throw new Error(json.errors?.[0]?.message || `Failed to upload ${file.name}`)
        }
        setAttachments((prev) => [
          ...prev,
          {
            id: json.doc!.id,
            filename: json.doc!.filename || file.name,
            originalFilename: json.doc!.originalFilename || file.name,
            mimeType: json.doc!.mimeType || file.type || 'application/octet-stream',
            filesize: json.doc!.filesize ?? file.size,
            url: json.doc!.url ?? null,
            disposition: 'attachment',
            contentId: null,
            skippedReason: null,
          },
        ])
      }
      toast.success(
        files.length === 1 ? `Attached ${files[0].name}` : `Attached ${files.length} files`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Attachment upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const submitMail = async (saveAsDraft: boolean) => {
    if (!saveAsDraft && !to.trim()) {
      toast.error('Please enter at least one recipient in the "To" field.')
      return
    }
    if (!saveAsDraft && !text.trim()) {
      toast.error('Please enter a message body before sending.')
      return
    }

    setSubmitting(saveAsDraft ? 'draft' : 'send')
    try {
      const res = await fetch(`${apiRoute}/mail/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromEmail,
          to,
          ...(cc.trim() ? { cc } : {}),
          ...(bcc.trim() ? { bcc } : {}),
          subject: subject.trim() || '(No subject)',
          text,
          attachmentIds: attachments.map((a) => a.id),
          replyToThreadId: initial?.replyToThreadId ?? null,
          replyToMessageId: initial?.replyToMessageId ?? null,
          draftMessageId: initial?.draftMessageId ?? null,
          saveAsDraft,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        dispatched?: boolean
        message?: MailMessageDTO
        thread?: MailThreadDetailDTO | null
        error?: string
      }

      if (!res.ok || !data.ok || !data.message) {
        throw new Error(data.error || 'Unable to process email.')
      }

      toast.success(
        saveAsDraft
          ? 'Draft saved to thread.'
          : data.dispatched
            ? 'Email sent via Resend.'
            : 'Email queued for background delivery.',
      )

      onCompleted({
        dispatched: Boolean(data.dispatched),
        message: data.message,
        thread: data.thread ?? null,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send email.')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="acn:sm:max-w-2xl">
        <div className="acn:space-y-4">
          <div>
            <h2 className="acn:m-0 acn:text-base acn:font-semibold">
              {initial?.replyToThreadId ? 'Reply to thread' : 'New message'}
            </h2>
            <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
              {outboundConfigured
                ? 'Dispatched via Resend with RFC 5322 Message-ID & thread continuity.'
                : 'RESEND_API_KEY is not set yet — you can compose and save drafts locally.'}
            </p>
          </div>

          <div className="acn:grid acn:gap-3">
            {identities.length > 1 ? (
              <div className="acn:grid acn:gap-1.5">
                <Label htmlFor="compose-from">From</Label>
                <select
                  id="compose-from"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="acn:h-9 acn:w-full acn:rounded-md acn:border acn:border-input acn:bg-background acn:px-2.5 acn:text-sm"
                >
                  {identities.map((idItem) => (
                    <option key={idItem.email} value={idItem.email}>
                      {idItem.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="acn:grid acn:gap-1.5">
              <div className="acn:flex acn:items-center acn:justify-between">
                <Label htmlFor="compose-to">To</Label>
                {!showCcBcc ? (
                  <button
                    type="button"
                    onClick={() => setShowCcBcc(true)}
                    className="acn:cursor-pointer acn:border-0 acn:bg-transparent acn:p-0 acn:text-xs acn:text-muted-foreground acn:hover:text-foreground"
                  >
                    + Cc / Bcc
                  </button>
                ) : null}
              </div>
              <Input
                id="compose-to"
                placeholder="jane@example.com, team@client.org"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            {showCcBcc ? (
              <div className="acn:grid acn:grid-cols-1 acn:gap-3 acn:sm:grid-cols-2">
                <div className="acn:grid acn:gap-1.5">
                  <Label htmlFor="compose-cc">Cc</Label>
                  <Input
                    id="compose-cc"
                    placeholder="cc@example.com"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                  />
                </div>
                <div className="acn:grid acn:gap-1.5">
                  <Label htmlFor="compose-bcc">Bcc</Label>
                  <Input
                    id="compose-bcc"
                    placeholder="bcc@example.com"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="acn:grid acn:gap-1.5">
              <Label htmlFor="compose-subject">Subject</Label>
              <Input
                id="compose-subject"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="acn:grid acn:gap-1.5">
              <Label htmlFor="compose-body">Message</Label>
              <Textarea
                id="compose-body"
                rows={8}
                placeholder="Write your message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="acn:min-h-44 acn:font-sans"
              />
            </div>

            {attachments.length > 0 ? (
              <div className="acn:flex acn:flex-wrap acn:gap-2">
                {attachments.map((att) => (
                  <Badge
                    key={String(att.id)}
                    variant="outline"
                    className="acn:flex acn:items-center acn:gap-1.5 acn:py-1"
                  >
                    <PaperclipIcon className="acn:size-3" />
                    <span className="acn:max-w-44 acn:truncate">{att.originalFilename}</span>
                    <span className="acn:text-[11px] acn:text-muted-foreground">
                      ({formatBytesHuman(att.filesize)})
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${att.originalFilename}`}
                      onClick={() =>
                        setAttachments((prev) => prev.filter((item) => item.id !== att.id))
                      }
                      className="acn:ml-0.5 acn:cursor-pointer acn:border-0 acn:bg-transparent acn:p-0 acn:text-muted-foreground acn:hover:text-foreground"
                    >
                      <XIcon className="acn:size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2 acn:border-t acn:border-border acn:pt-3">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="acn:hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || submitting !== null}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <LoaderCircleIcon className="acn:size-3.5 acn:animate-spin" />
                ) : (
                  <PaperclipIcon className="acn:size-3.5" />
                )}
                Attach file
              </Button>
            </div>

            <div className="acn:flex acn:items-center acn:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting !== null}
                onClick={() => void submitMail(true)}
              >
                {submitting === 'draft' ? (
                  <LoaderCircleIcon className="acn:size-3.5 acn:animate-spin" />
                ) : (
                  <SaveIcon className="acn:size-3.5" />
                )}
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={submitting !== null || !outboundConfigured}
                onClick={() => void submitMail(false)}
              >
                {submitting === 'send' ? (
                  <LoaderCircleIcon className="acn:size-3.5 acn:animate-spin" />
                ) : (
                  <SendIcon className="acn:size-3.5" />
                )}
                Send email
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
