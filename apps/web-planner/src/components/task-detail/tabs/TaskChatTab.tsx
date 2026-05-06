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
import { MoreHorizontal, Send } from '@future/ui/icons'
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
    immediatelyRender: false,
    extensions: [
      StarterKit,
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
                  'fixed z-50 rounded-lg border border-white/8 bg-surface shadow-dialog py-1 min-w-40'
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
