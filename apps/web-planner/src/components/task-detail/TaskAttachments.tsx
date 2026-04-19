'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@future/ui'
import { Paperclip, Link, MoreHorizontal, Download, ImageIcon, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import type { AttachmentSnapshot, TaskDetailSnapshot } from '@/lib/board-types'
import { useUpload } from '@/lib/hooks/useUpload'

interface TaskAttachmentsProps {
  taskId: string
  planId: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface AttachmentRowProps {
  attachment: AttachmentSnapshot
  isCover: boolean
  onSetCover: (id: string) => void
  onRemove: (id: string) => void
}

function AttachmentRow({ attachment, isCover, onSetCover, onRemove }: AttachmentRowProps) {
  const isImage = attachment.kind === 'file' && attachment.contentType?.startsWith('image/')
  const label =
    attachment.kind === 'link'
      ? (attachment.linkTitle ?? attachment.url ?? '')
      : (attachment.filename ?? '')

  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50">
      {attachment.kind === 'link' ? (
        <Link className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
      )}

      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">
          {attachment.kind === 'file' && attachment.sizeBytes != null
            ? `${formatBytes(attachment.sizeBytes)} · `
            : ''}
          {formatDate(attachment.createdAt)}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="invisible group-hover:visible"
            aria-label={`Options for ${attachment.id}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {attachment.kind === 'file' && attachment.url && (
            <DropdownMenuItem
              onSelect={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}
            >
              <Download className="mr-2 size-4" />
              Download
            </DropdownMenuItem>
          )}
          {isImage && !isCover && (
            <DropdownMenuItem onSelect={() => onSetCover(attachment.id)}>
              <ImageIcon className="mr-2 size-4" />
              Set as cover
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.id}`}
          >
            <Trash2 className="mr-2 size-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon-xs"
        className="invisible group-hover:visible"
        onClick={() => onRemove(attachment.id)}
        aria-label={`Remove ${attachment.id}`}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}

export function TaskAttachments({ taskId, planId }: TaskAttachmentsProps) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const queryKey = ['tasks.getDetail', taskId, actorId, tenantId] as const
  const task = queryClient.getQueryData<TaskDetailSnapshot>(queryKey)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [mutating, setMutating] = useState(false)

  const { uploadState, uploadFile } = useUpload({ taskId, planId })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['tasks.getDetail', taskId] })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    uploadFile(file).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Upload failed'
      toast(message)
    })
  }

  async function handleAddLink() {
    if (!linkUrl.trim() || !task) return
    setMutating(true)
    const attachmentId = crypto.randomUUID()
    try {
      await trpc.planner.attachments.addLink.mutate({
        tenantId,
        planId,
        taskId,
        attachmentId,
        actorId,
        url: linkUrl.trim(),
        linkTitle: linkTitle.trim() || undefined,
      })
      invalidate()
      setShowLinkForm(false)
      setLinkUrl('')
      setLinkTitle('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add link'
      toast(message)
    } finally {
      setMutating(false)
    }
  }

  function handleSetCover(attachmentId: string) {
    if (!task) return
    trpc.planner.attachments.setCover
      .mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        attachmentId,
        expectedVersion: task.updatedAt.toISOString(),
      })
      .then(() => {
        invalidate()
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to set cover'
        toast(message)
      })
  }

  function handleRemove(attachmentId: string) {
    if (!task) return
    trpc.planner.attachments.remove
      .mutate({
        tenantId,
        planId,
        taskId,
        attachmentId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
      })
      .then(() => {
        invalidate()
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to remove attachment'
        toast(message)
      })
  }

  const attachments = task?.attachments ?? []

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-medium">Attachments</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadState.uploading}
        >
          Attach file
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowLinkForm((v) => !v)
            setLinkUrl('')
            setLinkTitle('')
          }}
        >
          Attach link
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          aria-label="File upload input"
        />
      </div>

      {uploadState.uploading && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{uploadState.progress}%</span>
        </div>
      )}

      {uploadState.error && <span className="text-xs text-destructive">{uploadState.error}</span>}

      {showLinkForm && (
        <div className="flex flex-col gap-2 rounded-md border border-white/8 p-3">
          <Input
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddLink()
              if (e.key === 'Escape') {
                setShowLinkForm(false)
                setLinkUrl('')
                setLinkTitle('')
              }
            }}
            className="h-7 text-sm"
            autoFocus
          />
          <Input
            placeholder="Title (optional)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            className="h-7 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void handleAddLink()}
              disabled={!linkUrl.trim() || mutating}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowLinkForm(false)
                setLinkUrl('')
                setLinkTitle('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-col">
          {attachments.map((att) => (
            <AttachmentRow
              key={att.id}
              attachment={att}
              isCover={task?.coverAttachmentId === att.id}
              onSetCover={handleSetCover}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
