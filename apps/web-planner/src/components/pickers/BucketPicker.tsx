'use client'

import { useEffect } from 'react'
import { Button } from '@future/ui'

interface Bucket {
  id: string
  name: string
}

interface Props {
  buckets: Bucket[]
  currentBucketId: string
  onSelect: (bucketId: string) => void
  onClose: () => void
}

export function BucketPicker({ buckets, currentBucketId, onSelect, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="absolute left-0 top-full z-50 w-56 overflow-hidden rounded-lg border border-white/8 bg-surface shadow-dialog"
      data-testid="bucket-picker"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-white/5 px-3 py-2">
        <span className="text-caption font-510 text-fg-muted">Move to bucket</span>
      </div>
      <ul role="list" className="max-h-56 overflow-y-auto py-1">
        {buckets.map((bucket) => {
          const isSelected = bucket.id === currentBucketId
          return (
            <li key={bucket.id}>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-pressed={isSelected}
                data-testid={`bucket-option-${bucket.id}`}
                onClick={() => {
                  onSelect(bucket.id)
                  onClose()
                }}
                className="w-full justify-start gap-2 px-3 py-1.5"
              >
                <span className="flex-1 truncate text-small font-510">{bucket.name}</span>
                {isSelected && (
                  <svg viewBox="0 0 12 12" fill="none" className="size-3 text-accent" aria-hidden>
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
