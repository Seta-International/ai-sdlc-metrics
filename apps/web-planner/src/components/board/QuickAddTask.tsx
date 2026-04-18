'use client'

/**
 * QuickAddTask — placeholder for the quick-add task button at the top of a column.
 * Full implementation in Task 10.
 */
interface QuickAddTaskProps {
  bucketId: string
}

export function QuickAddTask({ bucketId: _bucketId }: QuickAddTaskProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-510 text-fg-muted transition-colors hover:bg-elevated hover:text-fg-secondary"
      aria-label="Add task"
    >
      <svg viewBox="0 0 12 12" fill="none" className="size-3 flex-shrink-0" aria-hidden>
        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
      Add task
    </button>
  )
}
