'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@future/api-client'
import { Button, Spinner } from '@future/ui'
import { X } from '@future/ui/icons'
import { trpc } from '@/lib/trpc'

interface Props {
  taskId: string
  planId: string
  tenantId: string
  actorId: string
  isOpen: boolean
  onClose: () => void
}

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    priority: 'Priority',
    progress: 'Progress',
    title: 'Title',
    description: 'Description',
    'assignee.added': 'Assignee added',
    'assignee.removed': 'Assignee removed',
    bucket: 'Bucket (moved)',
    'label.applied': 'Label applied',
    'label.removed': 'Label removed',
    sprint: 'Sprint',
    'dependency.added': 'Dependency added',
    'dependency.removed': 'Dependency removed',
  }
  if (field in map) return map[field]!
  if (field.startsWith('customField.')) return `Custom field: ${field.slice('customField.'.length)}`
  return field
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

interface HistoryItem {
  id: string
  field: string
  oldValue: unknown
  newValue: unknown
  actorId: string
  changedAt: Date
}

interface HistoryPage {
  items: HistoryItem[]
  nextCursor: string | null
}

export function TaskHistoryPane({ taskId, planId, tenantId, actorId, isOpen, onClose }: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery<HistoryPage>({
      queryKey: ['planner', 'task-history', taskId, tenantId],
      queryFn: ({ pageParam }) =>
        trpc.planner.tasks.getHistory.query({
          planId,
          taskId,
          actorId,
          tenantId,
          cursor: pageParam as string | undefined,
          limit: 20,
        }) as Promise<HistoryPage>,
      getNextPageParam: (lastPage: HistoryPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined,
      enabled: isOpen,
    })

  const handleFetchNext = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleFetchNext()
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [handleFetchNext])

  if (!isOpen) return null

  const allItems = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div
      className="absolute inset-y-0 right-0 z-10 flex w-80 flex-col border-l bg-white shadow-lg"
      data-testid="task-history-pane"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-medium">History</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close history"
          data-testid="history-close-btn"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : allItems.length === 0 ? (
          <p className="px-4 py-6 text-sm text-fg-muted">No history yet.</p>
        ) : (
          <ul className="divide-y">
            {allItems.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <p className="text-sm font-medium">{fieldLabel(item.field)}</p>
                <div className="mt-1 flex gap-2 text-xs text-fg-muted">
                  {item.oldValue !== null && item.oldValue !== undefined ? (
                    <span>
                      <span className="text-fg-muted">from</span>{' '}
                      <span className="font-medium">{formatValue(item.oldValue)}</span>
                    </span>
                  ) : null}
                  {item.newValue !== null && item.newValue !== undefined ? (
                    <span>
                      <span className="text-fg-muted">to</span>{' '}
                      <span className="font-medium">{formatValue(item.newValue)}</span>
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  {item.changedAt instanceof Date
                    ? item.changedAt.toLocaleString()
                    : new Date(item.changedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}

        {isFetchingNextPage ? (
          <div className="flex items-center justify-center py-4">
            <Spinner className="size-4" />
          </div>
        ) : null}

        <div ref={sentinelRef} className="h-1" />
      </div>
    </div>
  )
}
