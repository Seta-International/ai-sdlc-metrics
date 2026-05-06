# Phase 1 / Plan 4 — Tab Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the three remaining tab components — `TaskChecklistTab` (copy+rename of existing `TaskChecklist`), `TaskFilesTab` (inline merge of `TaskAttachments` + `TaskEvidence`), `TaskChatTab` (rename of `TaskComments` with Tiptap @mention composer).

**Architecture:**

- `TaskChecklistTab` = copy of `TaskChecklist.tsx` with export renamed. Logic unchanged; DnD drag-and-drop works as before.
- `TaskFilesTab` = single file inlining both `AttachmentsSection` and `EvidenceSection` as private functions — not a thin wrapper. This is done upfront so both source files can be safely deleted in Plan 5.
- `TaskChatTab` = `TaskComments` logic with the plain textarea composer replaced by a Tiptap editor + `@tiptap/extension-mention`. Comments are posted as plain text (`editor.getText()`). No backend changes.

**Prereq:** Plans 1–3 complete (Tiptap installed, pickers built, fields built).

---

## Exit Criteria

- [ ] `TaskChecklistTab` exists and the checklist renders correctly (copy of existing logic)
- [ ] `TaskFilesTab` exists with inlined attachments + evidence sections; no imports from `TaskAttachments.tsx` or `TaskEvidence.tsx`
- [ ] `TaskChatTab` exists; @mention trigger `@` shows a suggestion popup; comments submit on Enter; Shift+Enter inserts newline

---

## File Map

**Create:**

```
src/components/task-detail/tabs/
  TaskChecklistTab.tsx
  TaskFilesTab.tsx
  TaskChatTab.tsx
```

The original source files (`TaskChecklist.tsx`, `TaskAttachments.tsx`, `TaskEvidence.tsx`, `TaskComments.tsx`) remain until Plan 5 deletes them.

---

## Task 9: TaskChecklistTab

**Files:**

- Create: `src/components/task-detail/tabs/TaskChecklistTab.tsx`

Copy the existing checklist component and rename the export. The logic (DnD sort, add/toggle/edit/remove) is unchanged.

- [ ] **Step 1: Create TaskChecklistTab**

```bash
cp apps/web-planner/src/components/task-detail/TaskChecklist.tsx \
   apps/web-planner/src/components/task-detail/tabs/TaskChecklistTab.tsx
```

Open `apps/web-planner/src/components/task-detail/tabs/TaskChecklistTab.tsx` and change the export:

```
// find:
export function TaskChecklist(

// replace with:
export function TaskChecklistTab(
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web-planner && npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors (the old import in `TaskDetailPanel.tsx` still points to `TaskChecklist` — that's fine for now, Plan 5 fixes the panel).

- [ ] **Step 3: Commit**

```bash
git add apps/web-planner/src/components/task-detail/tabs/TaskChecklistTab.tsx
git commit -m "feat(web-planner): create TaskChecklistTab (renamed from TaskChecklist)"
```

---

## Task 10: TaskFilesTab (inline attachments + evidence)

**Files:**

- Create: `src/components/task-detail/tabs/TaskFilesTab.tsx`

This is a **self-contained** file that inlines both the `AttachmentsSection` and `EvidenceSection` logic. It does NOT import from `TaskAttachments.tsx` or `TaskEvidence.tsx`. This lets Plan 5 safely delete those files with no dangling imports.

Imports used:

- `@future/ui`: `Button`, `Input`, `Spinner`, `Badge`, `Separator`, `FileUploadTrigger`, `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`, `Textarea`, `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`
- `lucide-react`: `Paperclip`, `Link`, `MoreHorizontal`, `Download`, `ImageIcon`, `Trash2`, `Plus`, `StickyNote`, `ShieldCheck`
- `@future/ui`: `toast`
- `@/lib/trpc`: `trpc`
- `@/lib/query-keys`: `taskKeys`
- `@/lib/hooks/useUpload`: `useUpload`
- `@/lib/hooks/useTaskDetail`: `useTaskDetail`
- `@/lib/board-types`: `AttachmentSnapshot`

- [ ] **Step 1: Create TaskFilesTab**

Create `apps/web-planner/src/components/task-detail/tabs/TaskFilesTab.tsx`:

```tsx
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
} from 'lucide-react'
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
```

- [ ] **Step 2: Verify no imports from deleted files**

```bash
grep -r "TaskAttachments\|TaskEvidence" apps/web-planner/src/components/task-detail/tabs/ 2>/dev/null
```

Expected: No output.

- [ ] **Step 3: Commit**

```bash
git add apps/web-planner/src/components/task-detail/tabs/TaskFilesTab.tsx
git commit -m "feat(web-planner): add TaskFilesTab (inlined attachments + evidence)"
```

---

## Task 11: TaskChatTab with @mention support

**Files:**

- Create: `src/components/task-detail/tabs/TaskChatTab.tsx`

Replaces `TaskComments.tsx`. The plain textarea composer is replaced by a Tiptap editor with `@tiptap/extension-mention`. Comments are posted as plain text via `editor.getText()`. No backend changes.

- [ ] **Step 1: Create TaskChatTab**

Create `apps/web-planner/src/components/task-detail/tabs/TaskChatTab.tsx`:

```tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import { useSession } from '@future/auth'
import { useQueryClient } from '@future/api-client'
import {
  Button,
  Spinner,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  toast,
} from '@future/ui'
import { MoreHorizontal, Send } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { BoardSnapshot } from '@/lib/board-types'

interface Props {
  taskId: string
  planId: string
}

interface CommentItem {
  id: string
  authorActorId: string
  authorName?: string
  body: string
  createdAt: Date
  deleted: boolean
  pending?: boolean
}

const PAGE_SIZE = 20

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
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

function CommentRow({
  comment,
  currentActorId,
  onDelete,
}: {
  comment: CommentItem
  currentActorId: string
  onDelete: (id: string) => void
}) {
  if (comment.deleted) {
    return <div className="px-1 py-2 text-small italic text-fg-subtle">Comment deleted</div>
  }
  return (
    <div
      className={`group flex items-start gap-2 px-1 py-2 ${comment.pending ? 'opacity-50' : ''}`}
      data-testid="comment-item"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-caption font-510 text-fg-muted">
        {getInitials(comment.authorName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-small font-510">{comment.authorName ?? 'Unknown'}</span>
          <span className="text-caption text-fg-muted">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.pending && <Spinner className="size-3" />}
        </div>
        <p className="whitespace-pre-wrap text-small">{comment.body}</p>
      </div>
      {comment.authorActorId === currentActorId && !comment.pending && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="invisible shrink-0 group-hover:visible"
              aria-label="Comment options"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onDelete(comment.id)}>
              Delete comment
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function TaskChatTab({ taskId, planId }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const [comments, setComments] = useState<CommentItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const boardSnapshot = queryClient.getQueryData<BoardSnapshot>(
    taskKeys.board(planId, actorId, tenantId),
  )
  const members = boardSnapshot?.plan.members ?? []

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Mention.configure({
        suggestion: {
          items: ({ query }: { query: string }) =>
            members
              .filter((m) =>
                (m.person?.name ?? m.actorId).toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 8)
              .map((m) => ({ id: m.actorId, label: m.person?.name ?? m.actorId })),
          render: () => {
            let popup: HTMLElement | null = null
            return {
              onStart: (props: {
                items: { id: string; label: string }[]
                clientRect?: (() => DOMRect | null) | null
                command: (attrs: { id: string; label: string }) => void
              }) => {
                popup = document.createElement('div')
                popup.className =
                  'fixed z-50 rounded-lg border border-white/8 bg-surface shadow-dialog py-1 min-w-[160px]'
                const rect = props.clientRect?.()
                if (rect) {
                  popup.style.top = `${rect.bottom + 4}px`
                  popup.style.left = `${rect.left}px`
                }
                props.items.forEach((item) => {
                  const btn = document.createElement('button')
                  btn.className = 'w-full text-left px-3 py-1.5 text-small hover:bg-white/4'
                  btn.textContent = item.label
                  btn.addEventListener('click', () =>
                    props.command({ id: item.id, label: item.label }),
                  )
                  popup?.appendChild(btn)
                })
                document.body.appendChild(popup)
              },
              onUpdate: (props: {
                items: { id: string; label: string }[]
                clientRect?: (() => DOMRect | null) | null
                command: (attrs: { id: string; label: string }) => void
              }) => {
                if (!popup) return
                popup.innerHTML = ''
                const rect = props.clientRect?.()
                if (rect) {
                  popup.style.top = `${rect.bottom + 4}px`
                  popup.style.left = `${rect.left}px`
                }
                props.items.forEach((item) => {
                  const btn = document.createElement('button')
                  btn.className = 'w-full text-left px-3 py-1.5 text-small hover:bg-white/4'
                  btn.textContent = item.label
                  btn.addEventListener('click', () =>
                    props.command({ id: item.id, label: item.label }),
                  )
                  popup?.appendChild(btn)
                })
              },
              onKeyDown: (props: { event: KeyboardEvent }) => {
                if (props.event.key === 'Escape') {
                  popup?.remove()
                  return true
                }
                return false
              },
              onExit: () => {
                popup?.remove()
                popup = null
              },
            }
          },
        },
        HTMLAttributes: { class: 'mention', 'data-type': 'mention' },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[2.5rem] text-sm focus:outline-none',
        'data-testid': 'chat-composer',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          void handlePost()
          return true
        }
        return false
      },
    },
  })

  const loadComments = useCallback(
    async (cursor?: string) => {
      const result = (await trpc.planner.comments.list.query({
        tenantId,
        planId,
        taskId,
        actorId,
        ...(cursor ? { cursor } : {}),
        limit: PAGE_SIZE,
      })) as { items: CommentItem[]; nextCursor: string | null }
      return result
    },
    [tenantId, planId, taskId, actorId],
  )

  useEffect(() => {
    void (async () => {
      setLoadingInitial(true)
      try {
        const r = await loadComments()
        setComments(r.items)
        setNextCursor(r.nextCursor)
      } finally {
        setLoadingInitial(false)
      }
    })()
  }, [loadComments])

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await loadComments(nextCursor)
      setComments((prev) => [...prev, ...r.items])
      setNextCursor(r.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handlePost() {
    if (!editor) return
    const body = editor.getText({ blockSeparator: '\n' }).trim()
    if (!body || submitting) return
    editor.commands.clearContent()
    setSubmitting(true)
    const tempId = `opt-${crypto.randomUUID()}`
    const optimistic: CommentItem = {
      id: tempId,
      authorActorId: actorId,
      authorName: session?.displayName ?? 'You',
      body,
      createdAt: new Date(),
      deleted: false,
      pending: true,
    }
    setComments((prev) => [optimistic, ...prev])
    try {
      await trpc.planner.comments.post.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        commentId: crypto.randomUUID(),
        body,
      })
      setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, pending: false } : c)))
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      toast.error(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDelete(commentId: string) {
    const original = comments.find((c) => c.id === commentId)
    if (!original) return
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, deleted: true } : c)))
    void trpc.planner.comments.delete
      .mutate({ tenantId, planId, taskId, commentId, actorId })
      .catch((err: unknown) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? original : c)))
        toast.error(err instanceof Error ? err.message : 'Failed to delete comment')
      })
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid="chat-section">
      <h3 className="text-small font-510 text-fg-primary">Comments</h3>
      <div className="flex flex-col" data-testid="comment-list">
        {loadingInitial ? (
          <div className="flex flex-col gap-2 py-2">
            <div className="flex items-start gap-2">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          </div>
        ) : (
          comments.map((c) => (
            <CommentRow key={c.id} comment={c} currentActorId={actorId} onDelete={handleDelete} />
          ))
        )}
      </div>
      {nextCursor && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleLoadMore()}
          disabled={loadingMore}
          className="self-start"
        >
          {loadingMore ? <Spinner className="mr-2 size-3" /> : null}Load more
        </Button>
      )}
      <div className="mt-1 flex items-end gap-2 rounded-md border border-white/8 bg-elevated px-3 py-2">
        <div className="flex-1">
          <EditorContent editor={editor} />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void handlePost()}
          disabled={submitting}
          aria-label="Send comment"
        >
          {submitting ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </Button>
      </div>
      <p className="text-caption text-fg-muted">
        Enter to send · Shift+Enter for newline · @ to mention
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-planner/src/components/task-detail/tabs/TaskChatTab.tsx
git commit -m "feat(web-planner): add TaskChatTab with @mention support"
```
