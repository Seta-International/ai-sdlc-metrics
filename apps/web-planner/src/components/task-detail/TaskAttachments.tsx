'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import {
  Badge,
  Spinner,
  Button,
  Input,
  FileUploadTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@future/ui'
import { Paperclip, Link, MoreHorizontal, Download, ImageIcon, Trash2 } from '@future/ui/icons'
import { toast } from '@future/ui'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { AttachmentSnapshot } from '@/lib/board-types'
import { useUpload } from '@/lib/hooks/useUpload'
import { useTaskDetail } from '@/lib/hooks/useTaskDetail'

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
  mutating: boolean
  msSyncState: 'synced' | 'pending_upload' | 'pending_download' | 'not_syncable'
  onSetCover: (id: string) => void
  onRemove: (id: string) => void
}

function AttachmentRow({
  attachment,
  isCover,
  mutating,
  msSyncState,
  onSetCover,
  onRemove,
}: AttachmentRowProps) {
  const isImage = attachment.kind === 'file' && attachment.contentType.startsWith('image/')
  const label =
    attachment.kind === 'link' ? (attachment.linkTitle ?? attachment.url) : attachment.filename

  return (
    <div
      className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-white/4"
      data-testid={`attachment-row-${attachment.id}`}
    >
      {attachment.kind === 'link' ? (
        <Link className="size-4 shrink-0 text-fg-muted" />
      ) : (
        <Paperclip className="size-4 shrink-0 text-fg-muted" />
      )}

      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <span className="text-xs text-fg-muted">
          {attachment.kind === 'file' ? `${formatBytes(attachment.sizeBytes)} · ` : ''}
          {formatDate(attachment.createdAt)}
        </span>
        {msSyncState === 'pending_upload' && (
          <div
            className="flex items-center gap-1 text-xs text-fg-muted"
            data-testid="sync-state-pending-upload"
          >
            <Spinner className="size-3.5" />
            Uploading to Microsoft 365
          </div>
        )}
        {msSyncState === 'pending_download' && (
          <div
            className="flex items-center gap-1 text-xs text-fg-muted"
            data-testid="sync-state-pending-download"
          >
            <Spinner className="size-3.5" />
            Downloading from Microsoft 365
          </div>
        )}
        {msSyncState === 'not_syncable' && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="subtle" data-testid="sync-state-not-syncable">
                  Stays in Future
                </Badge>
              </TooltipTrigger>
              <TooltipContent>This attachment cannot be synced to Microsoft 365</TooltipContent>
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
            aria-label={`Options for ${label}`}
            disabled={mutating}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {attachment.kind === 'file' && (
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
          <DropdownMenuItem onSelect={() => onRemove(attachment.id)}>
            <Trash2 className="mr-2 size-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function TaskAttachments({ taskId, planId }: TaskAttachmentsProps) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const { task } = useTaskDetail({ taskId, planId })

  const dropZoneRef = useRef<HTMLDivElement>(null)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [mutating, setMutating] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const { uploadState, uploadFile } = useUpload({ taskId, planId })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
  }

  async function handleFileChange(files: FileList) {
    if (files.length === 0) return
    for (const file of Array.from(files)) {
      await uploadFile(file)
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      await uploadFile(file)
    }
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
      toast.error(message)
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
      .then(() => {
        invalidate()
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to set cover'
        toast.error(message)
      })
      .finally(() => {
        setMutating(false)
      })
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
      .then(() => {
        invalidate()
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to remove attachment'
        toast.error(message)
      })
      .finally(() => {
        setMutating(false)
      })
  }

  const attachments = task?.attachments ?? []

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

      {uploadState.uploading && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
          <span className="text-xs text-fg-muted">{uploadState.progress}%</span>
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

      <div
        ref={dropZoneRef}
        className={`rounded-md transition-colors ${isDragOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="drop-zone"
      >
        {isDragOver && attachments.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm text-fg-muted">
            Drop files here
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-col" data-testid="attachment-list">
            {attachments.map((att) => (
              <AttachmentRow
                key={att.id}
                attachment={att}
                isCover={task?.coverAttachmentId === att.id}
                mutating={mutating}
                msSyncState={att.msSyncState ?? 'synced'}
                onSetCover={handleSetCover}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
        {isDragOver && attachments.length > 0 && (
          <div className="flex items-center justify-center py-2 text-xs text-primary">
            Drop to attach
          </div>
        )}
      </div>
    </div>
  )
}
