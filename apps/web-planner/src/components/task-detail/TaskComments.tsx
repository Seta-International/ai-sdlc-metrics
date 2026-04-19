'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from '@future/auth'
import {
  Button,
  Textarea,
  Spinner,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@future/ui'
import { MoreHorizontal, Send } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

interface TaskCommentsProps {
  taskId: string
  planId: string
}

interface CommentItem {
  id: string
  authorActorId: string
  authorName?: string
  body: string
  createdAt: Date
  deletedAt: Date | null
  deleted: boolean
}

interface OptimisticComment extends CommentItem {
  pending?: boolean
}

const MAX_BODY = 4000
const COUNTER_THRESHOLD = 3800
const PAGE_SIZE = 20

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

interface CommentRowProps {
  comment: OptimisticComment
  currentActorId: string
  onDelete: (commentId: string) => void
}

function CommentRow({ comment, currentActorId, onDelete }: CommentRowProps) {
  if (comment.deleted) {
    return (
      <div
        className="flex items-center gap-2 px-1 py-2"
        data-testid="comment-item"
        data-comment-id={comment.id}
      >
        <span className="text-small italic text-fg-subtle">Comment deleted</span>
      </div>
    )
  }

  const isOwn = comment.authorActorId === currentActorId

  return (
    <div
      className={`group flex items-start gap-2 px-1 py-2 ${comment.pending ? 'opacity-50' : ''}`}
      data-testid="comment-item"
      data-comment-id={comment.id}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-caption font-510 text-fg-muted">
        {getInitials(comment.authorName)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-small font-510 text-fg-primary">
            {comment.authorName ?? 'Unknown'}
          </span>
          <span className="text-caption text-fg-muted">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.pending && <Spinner className="size-3" />}
        </div>
        <p className="whitespace-pre-wrap text-small text-fg-primary">{comment.body}</p>
      </div>

      {isOwn && !comment.pending && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
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

export function TaskComments({ taskId, planId }: TaskCommentsProps) {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const [comments, setComments] = useState<OptimisticComment[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadComments = useCallback(
    async (cursor?: string) => {
      const result = (await trpc.planner.comments.list.query({
        tenantId,
        planId,
        taskId,
        actorId,
        ...(cursor ? { cursor } : {}),
        limit: PAGE_SIZE,
      })) as { items: OptimisticComment[]; nextCursor: string | null }
      return result
    },
    [tenantId, planId, taskId, actorId],
  )

  useEffect(() => {
    void (async () => {
      setLoadingInitial(true)
      try {
        const result = await loadComments()
        setComments(result.items)
        setNextCursor(result.nextCursor)
      } finally {
        setLoadingInitial(false)
      }
    })()
  }, [loadComments])

  useEffect(() => {
    if (!body && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [body])

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await loadComments(nextCursor)
      setComments((prev) => [...prev, ...result.items])
      setNextCursor(result.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handlePost() {
    const trimmed = body.trim()
    if (!trimmed || submitting) return

    setBody('')
    setSubmitting(true)

    const tempId = `optimistic-${crypto.randomUUID()}`
    const optimistic: OptimisticComment = {
      id: tempId,
      authorActorId: actorId,
      authorName: session?.displayName ?? 'You',
      body: trimmed,
      createdAt: new Date(),
      deletedAt: null,
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
        body: trimmed,
      })
      setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, pending: false } : c)))
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      const message = err instanceof Error ? err.message : 'Failed to post comment'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handlePost()
    }
  }

  function handleDelete(commentId: string) {
    const original = comments.find((c) => c.id === commentId)
    if (!original) return

    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, deleted: true, deletedAt: new Date() } : c)),
    )

    void trpc.planner.comments.delete
      .mutate({
        tenantId,
        planId,
        taskId,
        commentId,
        actorId,
      })
      .catch((err: unknown) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? original : c)))
        const message = err instanceof Error ? err.message : 'Failed to delete comment'
        toast.error(message)
      })
  }

  const charCount = body.length
  const showCounter = charCount >= COUNTER_THRESHOLD

  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid="comments-section">
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
          comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              currentActorId={actorId}
              onDelete={handleDelete}
            />
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
          {loadingMore ? <Spinner className="mr-2 size-3" /> : null}
          Load more
        </Button>
      )}

      <div className="mt-1 flex flex-col gap-1" data-testid="comment-composer">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            data-testid="comment-textarea"
            placeholder="Add a comment… (Enter to post, Shift+Enter for newline)"
            value={body}
            rows={1}
            onChange={(e) => {
              setBody(e.target.value)
            }}
            onInput={(e: React.SyntheticEvent<HTMLTextAreaElement>) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${el.scrollHeight}px`
            }}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            className="flex-1 resize-none overflow-hidden text-sm"
            maxLength={MAX_BODY}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void handlePost()}
            disabled={!body.trim() || submitting}
            aria-label="Send comment"
          >
            {submitting ? <Spinner className="size-4" /> : <Send className="size-4" />}
          </Button>
        </div>
        {showCounter && (
          <span className="text-caption text-fg-muted self-end">
            {charCount}/{MAX_BODY}
          </span>
        )}
      </div>
    </div>
  )
}
