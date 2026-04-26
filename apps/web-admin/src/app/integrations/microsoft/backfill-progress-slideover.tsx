'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Progress,
  Button,
  toast,
} from '@future/ui'

export interface BackfillProgressSlideoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string | null
}

interface ProgressState {
  processed: number
  total: number
}

export function BackfillProgressSlideover({
  open,
  onOpenChange,
  jobId,
}: BackfillProgressSlideoverProps) {
  const [progress, setProgress] = useState<ProgressState>({ processed: 0, total: 0 })
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!open || !jobId) return

    const es = new EventSource(`/api/planner/ms-sync/backfill/${jobId}/progress`)
    esRef.current = es

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as
          | { type: 'progress'; processed: number; total: number }
          | { type: 'completed' }

        if (data.type === 'progress') {
          setProgress({ processed: data.processed, total: data.total })
        } else if (data.type === 'completed') {
          es.close()
          esRef.current = null
          onOpenChange(false)
          toast('Backfill complete')
        }
      } catch {
        // ignore parse errors
      }
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [open, jobId, onOpenChange])

  const pct = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0

  function handlePause() {
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Backfill in progress</SheetTitle>
          <SheetDescription>
            Importing plans from Microsoft 365 Planner. This may take a few minutes.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          <Progress value={pct} />
          <p className="text-sm text-muted-foreground">
            {progress.processed} / {progress.total} tasks imported
          </p>
          <Button variant="outline" onClick={handlePause}>
            Pause
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
