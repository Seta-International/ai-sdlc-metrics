'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@future/auth'
import { Button, Input, Textarea } from '@future/ui'
import { FileText, Link, StickyNote, ShieldCheck, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

interface TaskEvidenceProps {
  taskId: string
  planId: string
}

type EvidenceKind = 'file' | 'link' | 'note'

interface EvidenceItem {
  id: string
  kind: EvidenceKind
  caption: string
  submittedBy: string
  submittedAt: Date
  url?: string
  filename?: string
  contentType?: string
  sizeBytes?: number
  body?: string
}

interface OptimisticEvidenceItem extends EvidenceItem {
  pending?: boolean
}

const MAX_CAPTION = 500
const MAX_BODY = 4000

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function KindIcon({ kind }: { kind: EvidenceKind }) {
  if (kind === 'file') return <FileText className="size-4 shrink-0 text-fg-muted" />
  if (kind === 'link') return <Link className="size-4 shrink-0 text-fg-muted" />
  return <StickyNote className="size-4 shrink-0 text-fg-muted" />
}

interface EvidenceCardProps {
  item: OptimisticEvidenceItem
  currentActorId: string
  onRemove: (id: string) => void
}

function EvidenceCard({ item, currentActorId, onRemove }: EvidenceCardProps) {
  const isOwn = item.submittedBy === currentActorId

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border border-white/8 bg-elevated p-3 ${item.pending ? 'opacity-50' : ''}`}
      data-testid="evidence-card"
      data-evidence-id={item.id}
    >
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-caption font-510 text-fg-muted">
          {getInitials(item.submittedBy)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <KindIcon kind={item.kind} />
            <span className="text-caption text-fg-muted">
              {formatRelativeTime(item.submittedAt)}
            </span>
          </div>
          <p className="text-small font-510 text-fg-primary">{item.caption}</p>

          {item.kind === 'file' && item.filename && (
            <p className="mt-0.5 text-caption text-fg-muted">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {item.filename}
                </a>
              ) : (
                item.filename
              )}
            </p>
          )}

          {item.kind === 'link' && item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block text-caption text-fg-muted hover:underline"
            >
              {item.url}
            </a>
          )}

          {item.kind === 'note' && item.body && (
            <p className="mt-0.5 line-clamp-3 text-caption text-fg-muted">{item.body}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled
            title="Verification workflow coming in Phase 5"
            aria-label="Verify evidence"
          >
            <ShieldCheck className="size-4" />
          </Button>

          {isOwn && !item.pending && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemove(item.id)}
              aria-label="Remove evidence"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function TaskEvidence({ taskId, planId }: TaskEvidenceProps) {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const [items, setItems] = useState<OptimisticEvidenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [activeKind, setActiveKind] = useState<EvidenceKind>('note')
  const [caption, setCaption] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadItems = useCallback(async () => {
    try {
      const result = await trpc.planner.evidence.list.query({
        tenantId,
        planId,
        taskId,
        actorId,
      })
      setItems(result.items as OptimisticEvidenceItem[])
    } finally {
      setLoading(false)
    }
  }, [tenantId, planId, taskId, actorId])

  useEffect(() => {
    setLoading(true)
    void loadItems()
  }, [loadItems])

  function resetComposer() {
    setCaption('')
    setBody('')
    setLinkUrl('')
    setFile(null)
    setActiveKind('note')
    setShowComposer(false)
  }

  async function handleSubmit() {
    const trimmedCaption = caption.trim()
    if (!trimmedCaption || submitting) return

    setSubmitting(true)

    const tempId = `optimistic-${crypto.randomUUID()}`
    const now = new Date()

    let optimistic: OptimisticEvidenceItem

    if (activeKind === 'note') {
      optimistic = {
        id: tempId,
        kind: 'note',
        caption: trimmedCaption,
        body: body.trim(),
        submittedBy: actorId,
        submittedAt: now,
        pending: true,
      }
    } else if (activeKind === 'link') {
      optimistic = {
        id: tempId,
        kind: 'link',
        caption: trimmedCaption,
        url: linkUrl.trim(),
        submittedBy: actorId,
        submittedAt: now,
        pending: true,
      }
    } else {
      optimistic = {
        id: tempId,
        kind: 'file',
        caption: trimmedCaption,
        filename: file?.name,
        submittedBy: actorId,
        submittedAt: now,
        pending: true,
      }
    }

    setItems((prev) => [optimistic, ...prev])
    resetComposer()

    try {
      const evidenceId = crypto.randomUUID()

      if (activeKind === 'note') {
        await trpc.planner.evidence.createNote.mutate({
          tenantId,
          planId,
          taskId,
          evidenceId,
          actorId,
          body: body.trim(),
          caption: trimmedCaption,
        })
      } else if (activeKind === 'link') {
        await trpc.planner.evidence.createLink.mutate({
          tenantId,
          planId,
          taskId,
          evidenceId,
          actorId,
          url: linkUrl.trim(),
          caption: trimmedCaption,
        })
      } else if (activeKind === 'file' && file) {
        const { uploadUrl, storageKey } = await trpc.planner.evidence.requestUpload.mutate({
          tenantId,
          planId,
          taskId,
          actorId,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        })

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          }
          xhr.onerror = () => reject(new Error('Upload failed'))
          xhr.open('PUT', uploadUrl)
          xhr.setRequestHeader('Content-Type', file.type)
          xhr.send(file)
        })

        await trpc.planner.evidence.finalizeUpload.mutate({
          tenantId,
          planId,
          taskId,
          evidenceId,
          actorId,
          storageKey,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          caption: trimmedCaption,
        })
      }

      setItems((prev) => prev.map((it) => (it.id === tempId ? { ...it, pending: false } : it)))
      void loadItems()
    } catch (err) {
      setItems((prev) => prev.filter((it) => it.id !== tempId))
      const message = err instanceof Error ? err.message : 'Failed to add evidence'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleRemove(evidenceId: string) {
    const original = items.find((it) => it.id === evidenceId)
    if (!original) return

    setItems((prev) => prev.filter((it) => it.id !== evidenceId))

    void trpc.planner.evidence.remove
      .mutate({
        tenantId,
        planId,
        taskId,
        evidenceId,
        actorId,
      })
      .then(() => {
        void loadItems()
      })
      .catch((err: unknown) => {
        setItems((prev) => [original, ...prev])
        const message = err instanceof Error ? err.message : 'Failed to remove evidence'
        toast.error(message)
      })
  }

  const canSubmit = caption.trim().length > 0 && !submitting

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-small font-510 text-fg-primary">Evidence</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowComposer((v) => !v)}
          aria-label="Add evidence"
        >
          <Plus className="mr-1 size-4" />
          Add evidence
        </Button>
      </div>

      {showComposer && (
        <div className="flex flex-col gap-3 rounded-md border border-white/8 bg-elevated p-3">
          <div className="flex gap-1">
            {(['Note', 'Link', 'File'] as const).map((kind) => (
              <Button
                key={kind}
                variant={activeKind === kind.toLowerCase() ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveKind(kind.toLowerCase() as EvidenceKind)}
              >
                {kind}
              </Button>
            ))}
          </div>

          {activeKind === 'note' && (
            <Textarea
              placeholder="Describe what happened…"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
              rows={3}
              className="resize-none text-sm"
            />
          )}

          {activeKind === 'link' && (
            <Input
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="text-sm"
            />
          )}

          {activeKind === 'file' && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                aria-label="Choose file"
              />
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                Choose file
              </Button>
              {file && <span className="text-caption text-fg-muted truncate">{file.name}</span>}
            </div>
          )}

          <Input
            placeholder="What does this prove?"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
            className="text-sm"
          />

          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              Add evidence
            </Button>
            <Button variant="ghost" size="sm" onClick={resetComposer}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-2 text-caption text-fg-subtle">Loading…</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <EvidenceCard
              key={item.id}
              item={item}
              currentActorId={actorId}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
