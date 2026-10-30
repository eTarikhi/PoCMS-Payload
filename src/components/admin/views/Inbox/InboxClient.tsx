'use client'

import { toast } from '@payloadcms/ui'
import {
  AlertTriangleIcon,
  ArchiveIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  InboxIcon,
  LoaderCircleIcon,
  MailIcon,
  MailOpenIcon,
  PaperclipIcon,
  PenSquareIcon,
  PlusIcon,
  RefreshCwIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/admin/elements/Badge'
import { Button } from '@/components/admin/elements/Button'
import { Checkbox } from '@/components/admin/elements/Checkbox'
import { Input } from '@/components/admin/elements/Input'
import { RunStatus, type RunTone } from '@/components/admin/elements/RunStatus'
import { Textarea } from '@/components/admin/elements/Textarea'
import { cn } from '@/components/admin/utilities/cn'
import {
  MAIL_DELIVERY_STATUS_LABELS,
  type MailDeliveryStatus,
  type MailFolder,
} from '@/plugins/mailInbox/constants'
import type {
  BulkThreadsAction,
  InboxFolderCounts,
  InboxSnapshot,
  MailLabelDTO,
  MailStreamEvent,
  MailThreadDetailDTO,
  MailThreadSummaryDTO,
} from '@/plugins/mailInbox/types'

import { ComposeDrawer, type ComposeInitialState } from './ComposeDrawer'
import { SafeEmailIframe } from './SafeEmailIframe'

type ActiveFolderView = MailFolder | 'starred'

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 7 * 86_400) return `${Math.floor(diffSec / 86_400)}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatFullTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytesHuman(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function initialsOf(name: string, email: string): string {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return src.slice(0, 2).toUpperCase()
}

function deliveryStatusTone(status: MailDeliveryStatus): RunTone {
  switch (status) {
    case 'delivered':
    case 'opened':
    case 'clicked':
    case 'received':
      return 'good'
    case 'queued':
    case 'scheduled':
    case 'sent':
    case 'delivery_delayed':
      return 'running'
    case 'bounced':
    case 'complained':
    case 'failed':
    case 'suppressed':
      return 'poor'
    default:
      return 'muted'
  }
}

const PRESET_LABEL_COLORS = [
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#14B8A6',
] as const

export function InboxClient({
  initialSnapshot,
  apiRoute,
  adminRoute,
}: {
  initialSnapshot: InboxSnapshot
  apiRoute: string
  adminRoute: string
}) {
  const [counts, setCounts] = useState<InboxFolderCounts>(initialSnapshot.counts)
  const [labels, setLabels] = useState<MailLabelDTO[]>(initialSnapshot.labels)
  const [threads, setThreads] = useState<MailThreadSummaryDTO[]>(initialSnapshot.threads)
  const [activeFolder, setActiveFolder] = useState<ActiveFolderView>('inbox')
  const [activeLabelId, setActiveLabelId] = useState<string | number | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loadingList, setLoadingList] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([])
  const [openThreadId, setOpenThreadId] = useState<string | number | null>(
    initialSnapshot.threads[0]?.id ?? null,
  )
  const [threadDetail, setThreadDetail] = useState<MailThreadDetailDTO | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({})
  const [remoteImagesAllowed, setRemoteImagesAllowed] = useState<Record<string, boolean>>({})
  const [quotedExpanded, setQuotedExpanded] = useState<Record<string, boolean>>({})

  const [quickReplyText, setQuickReplyText] = useState('')
  const [sendingQuickReply, setSendingQuickReply] = useState(false)

  const [composeOpen, setComposeOpen] = useState(false)
  const [composeKey, setComposeKey] = useState(0)
  const [composeInitial, setComposeInitial] = useState<ComposeInitialState | null>(null)

  const [newLabelOpen, setNewLabelOpen] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState<string>(PRESET_LABEL_COLORS[0])

  const [streamConnected, setStreamConnected] = useState(false)
  const [setupExpanded, setSetupExpanded] = useState(false)

  const activeFiltersRef = useRef({
    activeFolder,
    activeLabelId,
    unreadOnly,
    debouncedSearch,
    openThreadId,
  })

  useEffect(() => {
    activeFiltersRef.current = {
      activeFolder,
      activeLabelId,
      unreadOnly,
      debouncedSearch,
      openThreadId,
    }
  }, [activeFolder, activeLabelId, unreadOnly, debouncedSearch, openThreadId])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 240)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchInboxList = useCallback(
    async (opts?: {
      folder?: ActiveFolderView
      labelId?: string | number | null
      unread?: boolean
      q?: string
      silent?: boolean
    }) => {
      const f = opts?.folder ?? activeFiltersRef.current.activeFolder
      const lbl = opts?.labelId !== undefined ? opts.labelId : activeFiltersRef.current.activeLabelId
      const un = opts?.unread !== undefined ? opts.unread : activeFiltersRef.current.unreadOnly
      const q = opts?.q !== undefined ? opts.q : activeFiltersRef.current.debouncedSearch

      await Promise.resolve()
      if (!opts?.silent) setLoadingList(true)
      try {
        const params = new URLSearchParams()
        params.set('folder', f)
        if (un) params.set('unread', 'true')
        if (lbl !== null && lbl !== undefined && lbl !== '') params.set('labelId', String(lbl))
        if (q.trim()) params.set('q', q.trim())

        const res = await fetch(`${apiRoute}/mail/inbox?${params.toString()}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const snap = (await res.json()) as InboxSnapshot
        setCounts(snap.counts)
        setLabels(snap.labels)
        setThreads(snap.threads)
      } finally {
        if (!opts?.silent) setLoadingList(false)
      }
    },
    [apiRoute],
  )

  const fetchThreadDetail = useCallback(
    async (threadId: string | number, silent = false) => {
      await Promise.resolve()
      if (!silent) setLoadingDetail(true)
      try {
        const res = await fetch(`${apiRoute}/mail/threads/${encodeURIComponent(String(threadId))}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          if (res.status === 404) setThreadDetail(null)
          return
        }
        const data = (await res.json()) as { thread: MailThreadDetailDTO }
        setThreadDetail(data.thread)
        // Auto-expand the newest message in the thread
        const lastMsg = data.thread.messages[data.thread.messages.length - 1]
        if (lastMsg) {
          setExpandedMessageIds((prev) => ({ ...prev, [String(lastMsg.id)]: true }))
        }
        // Reflect read state immediately in thread list & unread badge
        setThreads((prev) =>
          prev.map((t) =>
            String(t.id) === String(threadId) ? { ...t, isRead: true, unreadCount: 0 } : t,
          ),
        )
      } finally {
        if (!silent) setLoadingDetail(false)
      }
    },
    [apiRoute],
  )

  // Refresh thread list whenever filter controls change
  const initialMountRef = useRef(true)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    const timer = setTimeout(() => {
      void fetchInboxList({
        folder: activeFolder,
        labelId: activeLabelId,
        unread: unreadOnly,
        q: debouncedSearch,
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [activeFolder, activeLabelId, unreadOnly, debouncedSearch, fetchInboxList])

  // Hydrate initial or selected thread detail
  useEffect(() => {
    if (openThreadId === null || openThreadId === undefined) return
    const timer = setTimeout(() => {
      void fetchThreadDetail(openThreadId)
    }, 0)
    return () => clearTimeout(timer)
  }, [openThreadId, fetchThreadDetail])

  // Subscribe to SSE `/api/mail/stream` for real-time inbound & delivery telemetry updates
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(`${apiRoute}/mail/stream`, { withCredentials: true })

    es.onopen = () => {
      setStreamConnected(true)
    }
    es.onerror = () => {
      setStreamConnected(false)
    }
    es.addEventListener('mail', (rawEvt) => {
      setStreamConnected(true)
      try {
        const parsed = JSON.parse((rawEvt as MessageEvent<string>).data) as MailStreamEvent
        if (parsed.type === 'snapshot') {
          if (typeof parsed.unreadCount === 'number') {
            setCounts((prev) => ({ ...prev, inboxUnread: parsed.unreadCount! }))
          }
          return
        }
        void fetchInboxList({ silent: true })
        const currentOpen = activeFiltersRef.current.openThreadId
        if (currentOpen !== null && String(parsed.threadId) === String(currentOpen)) {
          void fetchThreadDetail(currentOpen, true)
        }
      } catch {
        // Ignore non-JSON frame
      }
    })

    return () => {
      es.close()
    }
  }, [apiRoute, fetchInboxList, fetchThreadDetail])

  const openComposeModal = (init?: ComposeInitialState) => {
    setComposeInitial(init ?? null)
    setComposeKey((k) => k + 1)
    setComposeOpen(true)
  }

  const runBulkAction = async (
    ids: Array<string | number>,
    action: BulkThreadsAction,
    extra?: { folder?: MailFolder; labelId?: string | number },
  ) => {
    if (ids.length === 0) return
    try {
      const res = await fetch(`${apiRoute}/mail/threads/bulk`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadIds: ids,
          action,
          ...extra,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        counts?: InboxFolderCounts
        error?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Action failed.')
      }
      if (json.counts) setCounts(json.counts)
      setSelectedIds([])

      if (
        (action === 'moveFolder' || action === 'deletePermanent') &&
        openThreadId !== null &&
        ids.some((id) => String(id) === String(openThreadId))
      ) {
        setOpenThreadId(null)
        setThreadDetail(null)
      }

      await fetchInboxList({ silent: true })
      if (openThreadId !== null && (action === 'addLabel' || action === 'removeLabel')) {
        await fetchThreadDetail(openThreadId, true)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk action failed.')
    }
  }

  const handleQuickReply = async (saveAsDraft = false) => {
    if (!threadDetail) return
    if (!saveAsDraft && !quickReplyText.trim()) {
      toast.error('Write a reply message first.')
      return
    }
    const lastMsg = threadDetail.messages[threadDetail.messages.length - 1]
    const replyTarget =
      lastMsg?.replyTo?.[0]?.address ||
      (lastMsg?.direction !== 'outbound' ? lastMsg?.from.address : lastMsg?.to?.[0]?.address) ||
      threadDetail.counterpartyEmail

    if (!saveAsDraft && !replyTarget) {
      toast.error('No valid recipient email address on this thread.')
      return
    }

    setSendingQuickReply(true)
    try {
      const subj = threadDetail.subject.toLowerCase().startsWith('re:')
        ? threadDetail.subject
        : `Re: ${threadDetail.subject}`

      const res = await fetch(`${apiRoute}/mail/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: replyTarget,
          subject: subj,
          text: quickReplyText,
          replyToThreadId: threadDetail.id,
          replyToMessageId: lastMsg?.id ?? null,
          saveAsDraft,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        dispatched?: boolean
        thread?: MailThreadDetailDTO
        error?: string
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to send reply.')
      }

      setQuickReplyText('')
      if (data.thread) {
        setThreadDetail(data.thread)
        const newest = data.thread.messages[data.thread.messages.length - 1]
        if (newest) {
          setExpandedMessageIds((prev) => ({ ...prev, [String(newest.id)]: true }))
        }
      }
      toast.success(saveAsDraft ? 'Draft reply saved.' : 'Reply sent via Resend.')
      void fetchInboxList({ silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reply failed.')
    } finally {
      setSendingQuickReply(false)
    }
  }

  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabelName.trim()) return
    try {
      const res = await fetch(`${apiRoute}/mail/labels`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: newLabelName.trim(),
          color: newLabelColor,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        label?: MailLabelDTO
        error?: string
      }
      if (!res.ok || !json.ok || !json.label) {
        throw new Error(json.error || 'Could not create label.')
      }
      setLabels((prev) => [...prev, json.label!])
      setNewLabelName('')
      setNewLabelOpen(false)
      toast.success(`Label "${json.label.name}" created.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create label.')
    }
  }

  const handleDeleteLabel = async (label: MailLabelDTO) => {
    try {
      const res = await fetch(`${apiRoute}/mail/labels`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: label.id }),
      })
      if (!res.ok) throw new Error('Could not delete label.')
      setLabels((prev) => prev.filter((l) => String(l.id) !== String(label.id)))
      if (String(activeLabelId) === String(label.id)) setActiveLabelId(null)
      toast.success(`Deleted label "${label.name}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete label.')
    }
  }

  const allSelected = useMemo(
    () => threads.length > 0 && threads.every((t) => selectedIds.includes(t.id)),
    [threads, selectedIds],
  )

  const { integration, identities } = initialSnapshot
  const needsSetupHint = !integration.outboundConfigured || !integration.webhookConfigured

  const folderItems: Array<{
    key: ActiveFolderView
    label: string
    icon: React.ReactNode
    badge?: number
  }> = [
    {
      key: 'inbox',
      label: 'Inbox',
      icon: <InboxIcon className="acn:size-4" />,
      badge: counts.inboxUnread,
    },
    {
      key: 'starred',
      label: 'Starred',
      icon: <StarIcon className="acn:size-4" />,
      badge: counts.starred || undefined,
    },
    {
      key: 'sent',
      label: 'Sent',
      icon: <SendIcon className="acn:size-4" />,
    },
    {
      key: 'archive',
      label: 'Archive',
      icon: <ArchiveIcon className="acn:size-4" />,
    },
    {
      key: 'spam',
      label: 'Spam',
      icon: <ShieldAlertIcon className="acn:size-4" />,
      badge: counts.spamUnread || undefined,
    },
    {
      key: 'trash',
      label: 'Trash',
      icon: <Trash2Icon className="acn:size-4" />,
    },
  ]

  return (
    <div className="acn:space-y-4 acn:pb-10">
      {/* Header Bar */}
      <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-3">
        <div>
          <div className="acn:flex acn:items-center acn:gap-2.5">
            <h1 className="acn:m-0 acn:text-xl acn:font-semibold acn:tracking-tight">
              Mail inbox
            </h1>
            <RunStatus
              tone={streamConnected ? 'good' : 'muted'}
              label={streamConnected ? 'Live stream' : 'Sync ready'}
            />
            {counts.inboxUnread > 0 ? (
              <Badge variant="default">{counts.inboxUnread} unread</Badge>
            ) : null}
          </div>
          <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
            Unified Resend inbound/outbound email workspace &amp; website form threads.
          </p>
        </div>

        <div className="acn:flex acn:items-center acn:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchInboxList()}
            disabled={loadingList}
          >
            <RefreshCwIcon className={cn('acn:size-3.5', loadingList && 'acn:animate-spin')} />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => openComposeModal()}>
            <PenSquareIcon className="acn:size-3.5" />
            Compose
          </Button>
        </div>
      </div>

      {/* Collapsible Resend Integration Status Banner when env keys aren't fully set */}
      {needsSetupHint ? (
        <div className="acn:rounded-xl acn:border acn:border-border acn:bg-muted/30 acn:px-4 acn:py-3 acn:text-xs">
          <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
            <div className="acn:flex acn:items-center acn:gap-2">
              <AlertTriangleIcon className="acn:size-4 acn:text-amber-500" />
              <span className="acn:font-medium">
                Form-bridged threads &amp; drafts are active locally.
              </span>
              <span className="acn:text-muted-foreground">
                Outbound API: {integration.outboundConfigured ? 'Connected' : 'Missing RESEND_API_KEY'} ·
                Webhook HMAC: {integration.webhookConfigured ? 'Connected' : 'Missing RESEND_WEBHOOK_SECRET'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSetupExpanded((v) => !v)}
              className="acn:cursor-pointer acn:border-0 acn:bg-transparent acn:p-0 acn:text-xs acn:font-medium acn:underline"
            >
              {setupExpanded ? 'Hide setup details' : 'Webhook setup guide'}
            </button>
          </div>
          {setupExpanded ? (
            <div className="acn:mt-2.5 acn:grid acn:gap-1.5 acn:border-t acn:border-border acn:pt-2.5 acn:text-muted-foreground">
              <div>
                1. Set <code className="acn:font-mono acn:text-foreground">RESEND_API_KEY</code> in{' '}
                <code className="acn:font-mono">.env</code> to enable outbound sending &amp; inbound MIME fetching.
              </div>
              <div>
                2. In your Resend Dashboard → Webhooks, register{' '}
                <code className="acn:font-mono acn:text-foreground">
                  {integration.webhookEndpointPath}
                </code>{' '}
                for <code className="acn:font-mono">email.*</code> events and set{' '}
                <code className="acn:font-mono acn:text-foreground">RESEND_WEBHOOK_SECRET</code> (starts with{' '}
                <code className="acn:font-mono">whsec_</code>).
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Main 3-Pane Workspace */}
      <div className="acn:grid acn:min-h-[680px] acn:grid-cols-1 acn:overflow-hidden acn:rounded-xl acn:border acn:border-border acn:bg-card acn:lg:grid-cols-[210px_350px_minmax(0,1fr)]">
        {/* Pane 1: Folders & Labels Rail */}
        <aside className="acn:flex acn:flex-col acn:justify-between acn:border-b acn:border-border acn:bg-muted/20 acn:p-3 acn:lg:border-r acn:lg:border-b-0">
          <div className="acn:space-y-5">
            <nav aria-label="Mail folders" className="acn:space-y-0.5">
              {folderItems.map((item) => {
                const isActive = activeFolder === item.key && activeLabelId === null
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveFolder(item.key)
                      setActiveLabelId(null)
                      setSelectedIds([])
                    }}
                    className={cn(
                      'acn:flex acn:w-full acn:cursor-pointer acn:items-center acn:justify-between acn:rounded-lg acn:border-0 acn:px-2.5 acn:py-2 acn:text-left acn:text-xs acn:font-medium acn:transition-colors',
                      isActive
                        ? 'acn:bg-primary/10 acn:text-foreground'
                        : 'acn:bg-transparent acn:text-muted-foreground acn:hover:bg-muted acn:hover:text-foreground',
                    )}
                  >
                    <span className="acn:flex acn:items-center acn:gap-2">
                      {item.icon}
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span className="acn:rounded-full acn:bg-primary/15 acn:px-1.5 acn:py-0.5 acn:font-mono acn:text-[11px] acn:font-semibold acn:text-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </nav>

            {/* Labels Section */}
            <div className="acn:space-y-1.5">
              <div className="acn:flex acn:items-center acn:justify-between acn:px-2">
                <span className="acn:text-[11px] acn:font-semibold acn:tracking-wider acn:text-muted-foreground acn:uppercase">
                  Labels
                </span>
                <button
                  type="button"
                  aria-label="Create label"
                  onClick={() => setNewLabelOpen((v) => !v)}
                  className="acn:cursor-pointer acn:rounded acn:border-0 acn:bg-transparent acn:p-0.5 acn:text-muted-foreground acn:hover:text-foreground"
                >
                  <PlusIcon className="acn:size-3.5" />
                </button>
              </div>

              {newLabelOpen ? (
                <form
                  onSubmit={handleCreateLabel}
                  className="acn:space-y-2 acn:rounded-lg acn:border acn:border-border acn:bg-background acn:p-2"
                >
                  <Input
                    placeholder="Label name"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    className="acn:h-7 acn:text-xs"
                  />
                  <div className="acn:flex acn:items-center acn:justify-between acn:gap-1">
                    <div className="acn:flex acn:gap-1">
                      {PRESET_LABEL_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setNewLabelColor(hex)}
                          style={{ backgroundColor: hex }}
                          className={cn(
                            'acn:size-3.5 acn:cursor-pointer acn:rounded-full acn:border-0',
                            newLabelColor === hex && 'acn:ring-2 acn:ring-foreground acn:ring-offset-1',
                          )}
                        />
                      ))}
                    </div>
                    <Button type="submit" size="sm" className="acn:h-6 acn:px-2 acn:text-[11px]">
                      Add
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="acn:space-y-0.5">
                {labels.map((label) => {
                  const selected = String(activeLabelId) === String(label.id)
                  return (
                    <div
                      key={String(label.id)}
                      className={cn(
                        'acn:group acn:flex acn:items-center acn:justify-between acn:rounded-lg acn:px-2.5 acn:py-1.5 acn:text-xs',
                        selected
                          ? 'acn:bg-primary/10 acn:font-medium acn:text-foreground'
                          : 'acn:text-muted-foreground acn:hover:bg-muted acn:hover:text-foreground',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveLabelId((prev) =>
                            String(prev) === String(label.id) ? null : label.id,
                          )
                        }
                        className="acn:flex acn:flex-1 acn:cursor-pointer acn:items-center acn:gap-2 acn:border-0 acn:bg-transparent acn:p-0 acn:text-left acn:text-inherit"
                      >
                        <span
                          className="acn:size-2.5 acn:shrink-0 acn:rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="acn:truncate">{label.name}</span>
                      </button>
                      {!label.isSystem ? (
                        <button
                          type="button"
                          aria-label={`Delete ${label.name}`}
                          onClick={() => void handleDeleteLabel(label)}
                          className="acn:invisible acn:cursor-pointer acn:border-0 acn:bg-transparent acn:p-0 acn:text-muted-foreground acn:group-hover:visible acn:hover:text-destructive"
                        >
                          <XIcon className="acn:size-3" />
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="acn:mt-6 acn:border-t acn:border-border acn:pt-3 acn:text-[11px] acn:text-muted-foreground">
            <div>Sender: {integration.defaultFromEmail}</div>
            <div>Mode: {integration.realtimeMode === 'pg_listen' ? 'PG LISTEN/NOTIFY' : 'SSE Watermark'}</div>
          </div>
        </aside>

        {/* Pane 2: Thread List & Search/Bulk Controls */}
        <section className="acn:flex acn:flex-col acn:border-b acn:border-border acn:lg:border-r acn:lg:border-b-0">
          <div className="acn:space-y-2 acn:border-b acn:border-border acn:p-3">
            <div className="acn:relative">
              <SearchIcon className="acn:pointer-events-none acn:absolute acn:top-2.5 acn:left-2.5 acn:size-3.5 acn:text-muted-foreground" />
              <Input
                placeholder="Search or from:email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="acn:h-8 acn:pl-8 acn:text-xs"
              />
            </div>

            <div className="acn:flex acn:items-center acn:justify-between acn:gap-2">
              <div className="acn:flex acn:items-center acn:gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedIds(threads.map((t) => t.id))
                    } else {
                      setSelectedIds([])
                    }
                  }}
                  aria-label="Select all visible threads"
                />
                <span className="acn:text-xs acn:text-muted-foreground">
                  {selectedIds.length > 0
                    ? `${selectedIds.length} selected`
                    : `${threads.length} thread${threads.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setUnreadOnly((v) => !v)}
                className={cn(
                  'acn:cursor-pointer acn:rounded-full acn:border acn:px-2 acn:py-0.5 acn:text-[11px] acn:font-medium',
                  unreadOnly
                    ? 'acn:border-primary acn:bg-primary/10 acn:text-foreground'
                    : 'acn:border-border acn:bg-transparent acn:text-muted-foreground',
                )}
              >
                Unread only
              </button>
            </div>

            {selectedIds.length > 0 ? (
              <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-1 acn:pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="acn:h-6 acn:px-2 acn:text-[11px]"
                  onClick={() => void runBulkAction(selectedIds, 'markRead')}
                >
                  <MailOpenIcon className="acn:size-3" />
                  Read
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="acn:h-6 acn:px-2 acn:text-[11px]"
                  onClick={() => void runBulkAction(selectedIds, 'markUnread')}
                >
                  <MailIcon className="acn:size-3" />
                  Unread
                </Button>
                {activeFolder !== 'archive' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="acn:h-6 acn:px-2 acn:text-[11px]"
                    onClick={() =>
                      void runBulkAction(selectedIds, 'moveFolder', { folder: 'archive' })
                    }
                  >
                    <ArchiveIcon className="acn:size-3" />
                    Archive
                  </Button>
                ) : null}
                {activeFolder !== 'trash' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="acn:h-6 acn:px-2 acn:text-[11px]"
                    onClick={() =>
                      void runBulkAction(selectedIds, 'moveFolder', { folder: 'trash' })
                    }
                  >
                    <Trash2Icon className="acn:size-3" />
                    Trash
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="acn:h-6 acn:px-2 acn:text-[11px]"
                    onClick={() => void runBulkAction(selectedIds, 'deletePermanent')}
                  >
                    <Trash2Icon className="acn:size-3" />
                    Delete forever
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          {/* Thread Rows */}
          <div className="acn:max-h-[640px] acn:flex-1 acn:divide-y acn:divide-border acn:overflow-y-auto">
            {threads.length === 0 ? (
              <div className="acn:flex acn:flex-col acn:items-center acn:justify-center acn:px-6 acn:py-16 acn:text-center">
                <InboxIcon className="acn:mb-2 acn:size-8 acn:text-muted-foreground/50" />
                <p className="acn:m-0 acn:text-sm acn:font-medium">No conversations here</p>
                <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                  {debouncedSearch
                    ? 'No threads matched your search filter.'
                    : 'Inbound Resend emails and website /contact inquiries appear here automatically.'}
                </p>
              </div>
            ) : (
              threads.map((thread) => {
                const isSelected = selectedIds.includes(thread.id)
                const isActive = String(openThreadId) === String(thread.id)
                return (
                  <div
                    key={String(thread.id)}
                    onClick={() => setOpenThreadId(thread.id)}
                    className={cn(
                      'acn:flex acn:cursor-pointer acn:items-start acn:gap-2.5 acn:px-3 acn:py-3 acn:transition-colors',
                      isActive
                        ? 'acn:bg-primary/8'
                        : !thread.isRead
                          ? 'acn:bg-muted/35 acn:hover:bg-muted/60'
                          : 'acn:hover:bg-muted/30',
                    )}
                  >
                    <div
                      className="acn:flex acn:flex-col acn:items-center acn:gap-2 acn:pt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedIds((prev) =>
                            checked
                              ? [...prev, thread.id]
                              : prev.filter((id) => id !== thread.id),
                          )
                        }}
                        aria-label={`Select thread ${thread.subject}`}
                      />
                      <button
                        type="button"
                        aria-label={thread.isStarred ? 'Unstar thread' : 'Star thread'}
                        onClick={() =>
                          void runBulkAction(
                            [thread.id],
                            thread.isStarred ? 'unstar' : 'star',
                          )
                        }
                        className="acn:cursor-pointer acn:border-0 acn:bg-transparent acn:p-0"
                      >
                        <StarIcon
                          className={cn(
                            'acn:size-3.5',
                            thread.isStarred
                              ? 'acn:fill-amber-400 acn:text-amber-400'
                              : 'acn:text-muted-foreground/50 acn:hover:text-muted-foreground',
                          )}
                        />
                      </button>
                    </div>

                    <div className="acn:min-w-0 acn:flex-1 acn:space-y-1">
                      <div className="acn:flex acn:items-center acn:justify-between acn:gap-2">
                        <div className="acn:flex acn:min-w-0 acn:items-center acn:gap-1.5">
                          {!thread.isRead ? (
                            <span className="acn:size-2 acn:shrink-0 acn:rounded-full acn:bg-blue-500" />
                          ) : null}
                          <span
                            className={cn(
                              'acn:truncate acn:text-xs',
                              !thread.isRead ? 'acn:font-semibold acn:text-foreground' : 'acn:font-medium',
                            )}
                          >
                            {thread.counterpartyName || thread.counterpartyEmail || 'Unknown'}
                          </span>
                          {thread.messageCount > 1 ? (
                            <span className="acn:shrink-0 acn:font-mono acn:text-[11px] acn:text-muted-foreground">
                              {thread.messageCount}
                            </span>
                          ) : null}
                        </div>
                        <span className="acn:shrink-0 acn:text-[11px] acn:text-muted-foreground">
                          {formatRelativeTime(thread.lastMessageAt)}
                        </span>
                      </div>

                      <div
                        className={cn(
                          'acn:truncate acn:text-xs',
                          !thread.isRead
                            ? 'acn:font-semibold acn:text-foreground'
                            : 'acn:text-foreground/90',
                        )}
                      >
                        {thread.subject}
                      </div>

                      <p className="acn:m-0 acn:line-clamp-1 acn:text-[11px] acn:text-muted-foreground">
                        {thread.snippet || 'No preview available'}
                      </p>

                      <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-1 acn:pt-0.5">
                        {thread.sourceFormSubmissionId ? (
                          <span className="acn:inline-flex acn:items-center acn:gap-0.5 acn:rounded acn:bg-emerald-500/12 acn:px-1.5 acn:py-0.5 acn:text-[10px] acn:font-medium acn:text-emerald-600 acn:dark:text-emerald-400">
                            <FileTextIcon className="acn:size-2.5" />
                            Form
                          </span>
                        ) : null}
                        {thread.hasDraft ? (
                          <span className="acn:rounded acn:bg-amber-500/15 acn:px-1.5 acn:py-0.5 acn:text-[10px] acn:font-medium acn:text-amber-600 acn:dark:text-amber-400">
                            Draft
                          </span>
                        ) : null}
                        {thread.hasAttachments ? (
                          <PaperclipIcon className="acn:size-3 acn:text-muted-foreground" />
                        ) : null}
                        {thread.labels.map((lbl) => (
                          <span
                            key={String(lbl.id)}
                            className="acn:inline-flex acn:items-center acn:gap-1 acn:rounded acn:border acn:border-border acn:px-1.5 acn:py-0.2 acn:text-[10px] acn:font-medium"
                          >
                            <span
                              className="acn:size-1.5 acn:rounded-full"
                              style={{ backgroundColor: lbl.color }}
                            />
                            {lbl.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* Pane 3: Reading & Reply Workspace */}
        <section className="acn:flex acn:flex-col acn:bg-background/40">
          {loadingDetail ? (
            <div className="acn:flex acn:flex-1 acn:items-center acn:justify-center acn:p-12 acn:text-xs acn:text-muted-foreground">
              <LoaderCircleIcon className="acn:mr-2 acn:size-4 acn:animate-spin" />
              Loading conversation…
            </div>
          ) : !threadDetail ? (
            <div className="acn:flex acn:flex-1 acn:flex-col acn:items-center acn:justify-center acn:p-12 acn:text-center">
              <MailIcon className="acn:mb-3 acn:size-10 acn:text-muted-foreground/40" />
              <p className="acn:m-0 acn:text-sm acn:font-medium">Select a conversation</p>
              <p className="acn:m-0 acn:mt-1 acn:max-w-sm acn:text-xs acn:text-muted-foreground">
                Pick a thread on the left to inspect sanitized messages, delivery telemetry, and attachments, or compose a new email.
              </p>
            </div>
          ) : (
            <div className="acn:flex acn:flex-1 acn:flex-col">
              {/* Thread Action Toolbar */}
              <div className="acn:flex acn:flex-wrap acn:items-start acn:justify-between acn:gap-3 acn:border-b acn:border-border acn:p-4">
                <div className="acn:min-w-0 acn:flex-1 acn:space-y-1.5">
                  <h2 className="acn:m-0 acn:text-base acn:font-semibold acn:leading-snug">
                    {threadDetail.subject}
                  </h2>
                  <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-1.5">
                    <Badge variant="outline" className="acn:capitalize">
                      {threadDetail.folder}
                    </Badge>
                    {threadDetail.sourceFormSubmissionId ? (
                      <Link
                        href={`${adminRoute}/collections/form-submissions/${String(threadDetail.sourceFormSubmissionId)}`}
                        className="acn:inline-flex acn:items-center acn:gap-1 acn:rounded-md acn:bg-emerald-500/12 acn:px-2 acn:py-0.5 acn:text-xs acn:font-medium acn:text-emerald-700 acn:no-underline acn:hover:underline acn:dark:text-emerald-400"
                      >
                        Form submission #{String(threadDetail.sourceFormSubmissionId)}
                        <ExternalLinkIcon className="acn:size-3" />
                      </Link>
                    ) : null}
                    {threadDetail.labels.map((lbl) => (
                      <Badge
                        key={String(lbl.id)}
                        variant="outline"
                        className="acn:inline-flex acn:items-center acn:gap-1"
                      >
                        <span
                          className="acn:size-2 acn:rounded-full"
                          style={{ backgroundColor: lbl.color }}
                        />
                        {lbl.name}
                        <button
                          type="button"
                          aria-label={`Remove label ${lbl.name}`}
                          onClick={() =>
                            void runBulkAction([threadDetail.id], 'removeLabel', {
                              labelId: lbl.id,
                            })
                          }
                          className="acn:cursor-pointer acn:border-0 acn:bg-transparent acn:p-0 acn:text-muted-foreground acn:hover:text-foreground"
                        >
                          <XIcon className="acn:size-2.5" />
                        </button>
                      </Badge>
                    ))}

                    {labels.length > 0 ? (
                      <select
                        aria-label="Apply label"
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return
                          void runBulkAction([threadDetail.id], 'addLabel', {
                            labelId: e.target.value,
                          })
                        }}
                        className="acn:h-6 acn:rounded acn:border acn:border-border acn:bg-background acn:px-1.5 acn:text-[11px] acn:text-muted-foreground"
                      >
                        <option value="">+ Label</option>
                        {labels.map((l) => (
                          <option key={String(l.id)} value={String(l.id)}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>

                <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-1.5">
                  {threadDetail.folder !== 'inbox' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runBulkAction([threadDetail.id], 'moveFolder', { folder: 'inbox' })
                      }
                    >
                      <InboxIcon className="acn:size-3.5" />
                      Move to Inbox
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runBulkAction([threadDetail.id], 'moveFolder', { folder: 'archive' })
                      }
                    >
                      <ArchiveIcon className="acn:size-3.5" />
                      Archive
                    </Button>
                  )}
                  {threadDetail.folder !== 'spam' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runBulkAction([threadDetail.id], 'moveFolder', { folder: 'spam' })
                      }
                    >
                      <ShieldAlertIcon className="acn:size-3.5" />
                      Spam
                    </Button>
                  ) : null}
                  {threadDetail.folder !== 'trash' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runBulkAction([threadDetail.id], 'moveFolder', { folder: 'trash' })
                      }
                    >
                      <Trash2Icon className="acn:size-3.5" />
                      Trash
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = threadDetail.messages[threadDetail.messages.length - 1]
                      openComposeModal({
                        to:
                          last?.replyTo?.[0]?.address ||
                          threadDetail.counterpartyEmail ||
                          last?.from.address ||
                          '',
                        subject: threadDetail.subject.toLowerCase().startsWith('re:')
                          ? threadDetail.subject
                          : `Re: ${threadDetail.subject}`,
                        replyToThreadId: threadDetail.id,
                        replyToMessageId: last?.id ?? null,
                      })
                    }}
                  >
                    <ReplyIcon className="acn:size-3.5" />
                    Full composer
                  </Button>
                </div>
              </div>

              {/* Message Stack */}
              <div className="acn:max-h-[500px] acn:flex-1 acn:space-y-3 acn:overflow-y-auto acn:p-4">
                {threadDetail.messages.map((msg, idx) => {
                  const isNewest = idx === threadDetail.messages.length - 1
                  const msgKey = String(msg.id)
                  const isExpanded = expandedMessageIds[msgKey] ?? isNewest
                  const allowImg = Boolean(remoteImagesAllowed[msgKey])
                  const showQuoted = Boolean(quotedExpanded[msgKey])

                  const authPass =
                    msg.authResults &&
                    (msg.authResults.dkim === 'pass' || msg.authResults.spf === 'pass')
                  const authFail =
                    msg.authResults &&
                    msg.authResults.dmarc === 'fail' &&
                    msg.authResults.spf === 'fail'

                  return (
                    <article
                      key={msgKey}
                      className="acn:rounded-xl acn:border acn:border-border acn:bg-card acn:shadow-2xs"
                    >
                      <header
                        onClick={() =>
                          setExpandedMessageIds((prev) => ({
                            ...prev,
                            [msgKey]: !isExpanded,
                          }))
                        }
                        className="acn:flex acn:cursor-pointer acn:items-center acn:justify-between acn:gap-3 acn:px-4 acn:py-3"
                      >
                        <div className="acn:flex acn:min-w-0 acn:items-center acn:gap-2.5">
                          <div className="acn:flex acn:size-8 acn:shrink-0 acn:items-center acn:justify-center acn:rounded-full acn:bg-primary/12 acn:text-xs acn:font-semibold">
                            {initialsOf(msg.from.name, msg.from.address)}
                          </div>
                          <div className="acn:min-w-0">
                            <div className="acn:flex acn:flex-wrap acn:items-center acn:gap-1.5">
                              <span className="acn:text-xs acn:font-semibold">
                                {msg.from.name || msg.from.address}
                              </span>
                              {msg.from.name && msg.from.address ? (
                                <span className="acn:text-[11px] acn:text-muted-foreground">
                                  &lt;{msg.from.address}&gt;
                                </span>
                              ) : null}
                              {authPass ? (
                                <span
                                  title={`SPF: ${msg.authResults?.spf ?? '—'} · DKIM: ${msg.authResults?.dkim ?? '—'}`}
                                  className="acn:inline-flex acn:items-center acn:gap-0.5 acn:text-[11px] acn:text-emerald-600 acn:dark:text-emerald-400"
                                >
                                  <ShieldCheckIcon className="acn:size-3" />
                                  Verified
                                </span>
                              ) : authFail ? (
                                <span className="acn:inline-flex acn:items-center acn:gap-0.5 acn:text-[11px] acn:text-destructive">
                                  <ShieldAlertIcon className="acn:size-3" />
                                  Unverified sender
                                </span>
                              ) : null}
                            </div>
                            {isExpanded ? (
                              <div className="acn:truncate acn:text-[11px] acn:text-muted-foreground">
                                {msg.to.length > 0
                                  ? `To: ${msg.to.map((r) => r.address || r.name).join(', ')}`
                                  : msg.direction === 'form_submission'
                                    ? 'Submitted via website form'
                                    : ''}
                                {msg.cc.length > 0
                                  ? ` · Cc: ${msg.cc.map((r) => r.address).join(', ')}`
                                  : ''}
                              </div>
                            ) : (
                              <div className="acn:truncate acn:text-[11px] acn:text-muted-foreground">
                                {msg.snippet}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="acn:flex acn:shrink-0 acn:items-center acn:gap-2">
                          <RunStatus
                            tone={deliveryStatusTone(msg.status)}
                            label={
                              msg.status === 'opened' && msg.openCount > 1
                                ? `Opened (${msg.openCount})`
                                : msg.status === 'clicked' && msg.clickCount > 0
                                  ? `Clicked (${msg.clickCount})`
                                  : MAIL_DELIVERY_STATUS_LABELS[msg.status] || msg.status
                            }
                          />
                          <span className="acn:text-[11px] acn:text-muted-foreground">
                            {formatFullTimestamp(msg.sentAt)}
                          </span>
                          {isExpanded ? (
                            <ChevronDownIcon className="acn:size-4 acn:text-muted-foreground" />
                          ) : (
                            <ChevronRightIcon className="acn:size-4 acn:text-muted-foreground" />
                          )}
                        </div>
                      </header>

                      {isExpanded ? (
                        <div className="acn:space-y-3 acn:border-t acn:border-border acn:px-4 acn:py-3">
                          {msg.errorMessage ? (
                            <div className="acn:rounded-lg acn:border acn:border-destructive/40 acn:bg-destructive/10 acn:px-3 acn:py-2 acn:text-xs acn:text-destructive">
                              Delivery error: {msg.errorMessage}
                            </div>
                          ) : null}

                          {msg.hasRemoteImages && !allowImg ? (
                            <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2 acn:rounded-lg acn:border acn:border-border acn:bg-muted/40 acn:px-3 acn:py-2 acn:text-xs">
                              <span className="acn:text-muted-foreground">
                                Blocked {msg.blockedRemoteImages || 1} remote image
                                {msg.blockedRemoteImages === 1 ? '' : 's'} &amp; open trackers for privacy.
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="acn:h-6 acn:px-2 acn:text-[11px]"
                                onClick={() =>
                                  setRemoteImagesAllowed((prev) => ({
                                    ...prev,
                                    [msgKey]: true,
                                  }))
                                }
                              >
                                Load remote images
                              </Button>
                            </div>
                          ) : null}

                          {msg.sanitizedHtml ? (
                            <SafeEmailIframe
                              sanitizedHtml={msg.sanitizedHtml}
                              allowRemoteImages={allowImg}
                              subject={msg.subject}
                            />
                          ) : (
                            <div className="acn:whitespace-pre-wrap acn:rounded-lg acn:border acn:border-border acn:bg-background acn:p-3 acn:text-sm">
                              {msg.visibleReplyText || msg.plainText || '(Empty message)'}
                            </div>
                          )}

                          {msg.quotedHistoryText ? (
                            <div className="acn:space-y-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setQuotedExpanded((prev) => ({
                                    ...prev,
                                    [msgKey]: !showQuoted,
                                  }))
                                }
                                className="acn:cursor-pointer acn:rounded acn:border acn:border-border acn:bg-muted/40 acn:px-2 acn:py-0.5 acn:font-mono acn:text-xs acn:text-muted-foreground acn:hover:text-foreground"
                              >
                                {showQuoted ? 'Hide quoted history' : '··· Show quoted history'}
                              </button>
                              {showQuoted ? (
                                <pre className="acn:m-0 acn:max-h-56 acn:overflow-y-auto acn:whitespace-pre-wrap acn:rounded-lg acn:border acn:border-border acn:bg-muted/20 acn:p-3 acn:font-sans acn:text-xs acn:text-muted-foreground">
                                  {msg.quotedHistoryText}
                                </pre>
                              ) : null}
                            </div>
                          ) : null}

                          {msg.attachments.length > 0 ? (
                            <div className="acn:space-y-1.5 acn:pt-1">
                              <div className="acn:text-[11px] acn:font-semibold acn:text-muted-foreground">
                                Attachments ({msg.attachments.length})
                              </div>
                              <div className="acn:flex acn:flex-wrap acn:gap-2">
                                {msg.attachments.map((att) =>
                                  att.url ? (
                                    <a
                                      key={String(att.id)}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="acn:inline-flex acn:items-center acn:gap-1.5 acn:rounded-lg acn:border acn:border-border acn:bg-background acn:px-2.5 acn:py-1.5 acn:text-xs acn:text-foreground acn:no-underline acn:hover:bg-muted"
                                    >
                                      <PaperclipIcon className="acn:size-3.5 acn:text-muted-foreground" />
                                      <span className="acn:max-w-48 acn:truncate acn:font-medium">
                                        {att.originalFilename}
                                      </span>
                                      <span className="acn:text-[11px] acn:text-muted-foreground">
                                        {formatBytesHuman(att.filesize)}
                                      </span>
                                    </a>
                                  ) : (
                                    <span
                                      key={String(att.id)}
                                      title={att.skippedReason ?? 'Attachment unavailable'}
                                      className="acn:inline-flex acn:items-center acn:gap-1.5 acn:rounded-lg acn:border acn:border-dashed acn:border-border acn:px-2.5 acn:py-1.5 acn:text-xs acn:text-muted-foreground"
                                    >
                                      <AlertTriangleIcon className="acn:size-3.5 acn:text-amber-500" />
                                      <span>{att.originalFilename} (skipped: size limit)</span>
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              {/* Inline Quick Reply Box */}
              <div className="acn:border-t acn:border-border acn:bg-card acn:p-4">
                <div className="acn:space-y-2.5">
                  <Textarea
                    rows={3}
                    placeholder={`Reply to ${threadDetail.counterpartyName || threadDetail.counterpartyEmail || 'sender'}…`}
                    value={quickReplyText}
                    onChange={(e) => setQuickReplyText(e.target.value)}
                    className="acn:min-h-20 acn:text-sm"
                  />
                  <div className="acn:flex acn:flex-wrap acn:items-center acn:justify-between acn:gap-2">
                    <span className="acn:text-[11px] acn:text-muted-foreground">
                      <CheckCheckIcon className="acn:mr-1 acn:inline acn:size-3.5" />
                      Threads automatically via RFC 5322 In-Reply-To &amp; References
                    </span>
                    <div className="acn:flex acn:items-center acn:gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={sendingQuickReply || !quickReplyText.trim()}
                        onClick={() => void handleQuickReply(true)}
                      >
                        Save draft
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          sendingQuickReply ||
                          !quickReplyText.trim() ||
                          !integration.outboundConfigured
                        }
                        onClick={() => void handleQuickReply(false)}
                      >
                        {sendingQuickReply ? (
                          <LoaderCircleIcon className="acn:size-3.5 acn:animate-spin" />
                        ) : (
                          <SendIcon className="acn:size-3.5" />
                        )}
                        Send reply
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal Full Composer */}
      <ComposeDrawer
        key={composeKey}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        apiRoute={apiRoute}
        identities={identities}
        outboundConfigured={integration.outboundConfigured}
        initial={composeInitial}
        onCompleted={({ thread }) => {
          void fetchInboxList({ silent: true })
          if (thread) {
            setOpenThreadId(thread.id)
            setThreadDetail(thread)
          }
        }}
      />
    </div>
  )
}
