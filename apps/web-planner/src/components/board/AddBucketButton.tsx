'use client'

/**
 * AddBucketButton — appears at the right end of the board to add a new bucket.
 * Implementation (calling the create-bucket mutation) is wired in Task 11.
 */
interface AddBucketButtonProps {
  onClick?: () => void
}

export function AddBucketButton({ onClick }: AddBucketButtonProps) {
  return (
    <div className="w-72 flex-shrink-0">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-lg border border-divider bg-transparent px-3 py-2.5 text-caption-lg font-510 text-fg-muted transition-colors hover:border-divider-md hover:bg-elevated hover:text-fg-secondary"
        aria-label="Add bucket"
      >
        <svg viewBox="0 0 12 12" fill="none" className="size-3.5 flex-shrink-0" aria-hidden>
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
        Add bucket
      </button>
    </div>
  )
}
