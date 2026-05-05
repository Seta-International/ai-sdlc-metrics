'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import {
  Badge,
  Button,
  Input,
  Spinner,
  Separator,
  FileUploadTrigger,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Textarea,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  toast,
} from '@future/ui'
import {
  Paperclip,
  Link,
  MoreHorizontal,
  Download,
  ImageIcon,
  Trash2,
  Plus,
  StickyNote,
} from '@future/ui/icons'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import { useUpload } from '@/lib/hooks/useUpload'
import { useTaskDetail } from '@/lib/hooks/useTaskDetail'
import type { AttachmentSnapshot } from '@/lib/board-types'

interface SectionProps {
  taskId: string
  planId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Attachments ─────────────────────────────────────────────────────────────

function AttachmentsSection({ taskId, planId }: SectionProps) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const { task } = useTaskDetail({ taskId, planId })
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [mutating, setMutating] = useState(false)
  const { uploadState, uploadFile } = useUpload({ taskId, planId })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
  }

  async function handleFileChange(files: FileList) {
    for (const file of Array.from(files)) await uploadFile(file)
  }

  async function handleAddLink() {
    if (!linkUrl.trim() || !task) return
    setMutating(true)
    try {
      await trpc.planner.attachments.addLink.mutate({
        tenantId,
        planId,
        taskId,
        attachmentId: crypto.randomUUID(),
        actorId,
        url: linkUrl.trim(),
        linkTitle: linkTitle.trim() || undefined,
      })
      invalidate()
      setShowLinkForm(false)
      setLinkUrl('')
      setLinkTitle('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add link')
    } finally {
      setMutating(false)
    }
  }

  function handleSetCover(attachmentId: string) {
    if (!task || mutating) return
    setMutating(true)
    trpc.planner.attachments.setCover
      .mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        attachmentId,
        expectedVersion: task.updatedAt.toISOString(),
      })
      .then(() => invalidate())
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to set cover')
      })
      .finally(() => setMutating(false))
  }

  function handleRemove(attachmentId: string) {
    if (!task || mutating) return
    setMutating(true)
    trpc.planner.attachments.remove
      .mutate({
        tenantId,
        planId,
        taskId,
        attachmentId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
      })
      .then(() => invalidate())
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to remove attachment')
      })
      .finally(() => setMutating(false))
  }

  const attachments: AttachmentSnapshot[] = task?.attachments ?? []

  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid="attachments-section">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-510">Attachments</h3>
        <FileUploadTrigger
          onFiles={(files) => void handleFileChange(files)}
          multiple
          variant="ghost"
          size="sm"
          disabled={uploadState.uploading}
          data-testid="attach-file-btn"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach file
        </FileUploadTrigger>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowLinkForm((v) => !v)
            setLinkUrl('')
            setLinkTitle('')
          }}
          data-testid="attach-link-btn"
        >
          Attach link
        </Button>
      </div>

      {showLinkForm && (
        <div className="flex flex-col gap-2 rounded-md border border-white/8 bg-elevated p-3">
          <Input
            type="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            data-testid="link-url-input"
          />
          <Input
            placeholder="Title (optional)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void handleAddLink()}
              disabled={!linkUrl.trim() || mutating}
              data-testid="add-link-submit"
            >
              Add link
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowLinkForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {attachments.map((a) => {
          const isImage = a.kind === 'file' && (a.contentType ?? '').startsWith('image/')
          const label = a.kind === 'link' ? (a.linkTitle ?? a.url) : a.filename
          return (
            <div
              key={a.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-white/4"
              data-testid={`attachment-row-${a.id}`}
            >
              {a.kind === 'link' ? (
                <Link className="size-4 shrink-0 text-fg-muted" />
              ) : (
                <Paperclip className="size-4 shrink-0 text-fg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm">{label}</span>
                <span className="text-xs text-fg-muted">
                  {a.kind === 'file' ? `${formatBytes(a.sizeBytes ?? 0)} · ` : ''}
                  {formatDate(a.createdAt)}
                </span>
                {a.msSyncState === 'pending_upload' && (
                  <div className="flex items-center gap-1 text-xs text-fg-muted">
                    <Spinner className="size-3.5" />
                    Uploading to Microsoft 365
                  </div>
                )}
                {a.msSyncState === 'pending_download' && (
                  <div className="flex items-center gap-1 text-xs text-fg-muted">
                    <Spinner className="size-3.5" />
                    Downloading from Microsoft 365
                  </div>
                )}
                {a.msSyncState === 'not_syncable' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="subtle">Stays in Future</Badge>
                      </TooltipTrigger>
                      <TooltipContent>Cannot be synced to Microsoft 365</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="invisible group-hover:visible"
                    disabled={mutating}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {a.kind === 'file' && (
                    <DropdownMenuItem
                      onSelect={() => window.open(a.url, '_blank', 'noopener,noreferrer')}
                    >
                      <Download className="mr-2 size-4" />
                      Download
                    </DropdownMenuItem>
                  )}
                  {isImage && a.id !== task?.coverAttachmentId && (
                    <DropdownMenuItem onSelect={() => handleSetCover(a.id)}>
                      <ImageIcon className="mr-2 size-4" />
                      Set as cover
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => handleRemove(a.id)}>
                    <Trash2 className="mr-2 size-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

type EvidenceKind = 'note' | 'link' | 'file'

interface EvidenceItem {
  id: string
  kind: EvidenceKind
  caption: string
  submittedBy: string
  submittedAt: Date
  pending?: boolean
}

function EvidenceSection({ taskId, planId }: SectionProps) {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [items, setItems] = useState<EvidenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [activeKind, setActiveKind] = useState<EvidenceKind>('note')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function resetComposer() {
    setShowComposer(false)
    setBody('')
    setLinkUrl('')
    setCaption('')
    setFile(null)
  }

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = (await trpc.planner.evidence.list.query({
        tenantId,
        planId,
        taskId,
        actorId,
      })) as { items: EvidenceItem[] }
      setItems(result.items)
    } finally {
      setLoading(false)
    }
  }, [tenantId, planId, taskId, actorId])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  async function handleSubmit() {
    if (!caption.trim() || submitting) return
    const evidenceId = crypto.randomUUID()
    const trimmedCaption = caption.trim()
    setSubmitting(true)
    const tempId = `optimistic-${evidenceId}`
    setItems((prev) => [
      {
        id: tempId,
        kind: activeKind,
        caption: trimmedCaption,
        submittedBy: actorId,
        submittedAt: new Date(),
        pending: true,
      },
      ...prev,
    ])
    resetComposer()
    try {
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
        const { uploadUrl, storageKey } = (await trpc.planner.evidence.requestUpload.mutate({
          tenantId,
          planId,
          taskId,
          actorId,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        })) as { uploadUrl: string; storageKey: string }
        await new Promise<void>((res, rej) => {
          const xhr = new XMLHttpRequest()
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? res()
              : rej(new Error(`Upload failed ${xhr.status}`))
          xhr.onerror = () => rej(new Error('Upload failed'))
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
      toast.error(err instanceof Error ? err.message : 'Failed to add evidence')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRemove(evidenceId: string) {
    const original = items.find((it) => it.id === evidenceId)
    if (!original) return
    setItems((prev) => prev.filter((it) => it.id !== evidenceId))
    void trpc.planner.evidence.remove
      .mutate({ tenantId, planId, taskId, evidenceId, actorId })
      .then(() => void loadItems())
      .catch((err: unknown) => {
        setItems((prev) => [...prev, original])
        toast.error(err instanceof Error ? err.message : 'Failed to remove evidence')
      })
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid="evidence-section">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-small font-510 text-fg-primary">Evidence</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowComposer((v) => !v)}
          aria-label="Add evidence"
          data-testid="add-evidence-btn"
        >
          <Plus className="mr-1 size-4" />
          Add evidence
        </Button>
      </div>
      {showComposer && (
        <div className="flex flex-col gap-3 rounded-md border border-white/8 bg-elevated p-3">
          <div className="flex gap-1">
            {(['File', 'Link', 'Note'] as const).map((k) => (
              <Button
                key={k}
                variant={activeKind === k.toLowerCase() ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveKind(k.toLowerCase() as EvidenceKind)}
                data-testid={`evidence-kind-${k.toLowerCase()}`}
              >
                {k}
              </Button>
            ))}
          </div>
          {activeKind === 'note' && (
            <Textarea
              placeholder="Describe what happened…"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 4000))}
              rows={3}
              className="resize-none"
            />
          )}
          {activeKind === 'link' && (
            <Input
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          )}
          {activeKind === 'file' && (
            <div className="flex items-center gap-2">
              <FileUploadTrigger
                onFiles={(files) => setFile(files[0] ?? null)}
                variant="ghost"
                size="sm"
                data-testid="evidence-file-input"
              >
                Choose file
              </FileUploadTrigger>
              {file && <span className="text-caption text-fg-muted truncate">{file.name}</span>}
            </div>
          )}
          <Input
            placeholder="What does this prove?"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 500))}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={!caption.trim() || submitting}
              data-testid="composer-submit"
            >
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
            <div
              key={item.id}
              className={`flex flex-col gap-1.5 rounded-md border border-white/8 bg-elevated p-3 ${item.pending ? 'opacity-50' : ''}`}
              data-testid="evidence-card"
            >
              <div className="flex items-start gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-caption font-510 text-fg-muted">
                  {item.submittedBy.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-small font-510 text-fg-primary">{item.caption}</p>
                </div>
                {item.submittedBy === actorId && !item.pending && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemove(item.id)}
                    aria-label="Remove evidence"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab composition ──────────────────────────────────────────────────────────

export function TaskFilesTab({ taskId, planId }: SectionProps) {
  return (
    <div className="flex flex-col">
      <AttachmentsSection taskId={taskId} planId={planId} />
      <Separator />
      <EvidenceSection taskId={taskId} planId={planId} />
    </div>
  )
}
