'use client'

export type FilterFirstEmptyStateProps = {
  itemCount: number
  threshold: number
  title?: string
  description?: string
  showAllLabel?: string
  onShowAll: () => void
}

export function FilterFirstEmptyState({
  itemCount,
  threshold: _threshold,
  title = 'Too many items to display',
  description = 'Apply a filter to narrow down the view.',
  showAllLabel = 'Show all',
  onShowAll,
}: FilterFirstEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {description} ({itemCount} items)
        </p>
      </div>
      <button
        onClick={onShowAll}
        className="rounded border border-border px-3 py-1 text-sm hover:bg-muted"
      >
        {showAllLabel}
      </button>
    </div>
  )
}
