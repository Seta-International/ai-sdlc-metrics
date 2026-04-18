'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@future/ui'
import { X } from 'lucide-react'

interface Props {
  taskId: string
  planId: string
}
export function TaskDetailPanel({ taskId, planId }: Props) {
  const router = useRouter()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [router])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">Task Detail</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.back()}
          aria-label="Close panel"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="p-4 text-sm text-neutral-500">
        Loading task {taskId} in plan {planId}…
      </div>
    </div>
  )
}
