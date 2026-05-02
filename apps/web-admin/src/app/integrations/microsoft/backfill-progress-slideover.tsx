'use client'

import { useEffect } from 'react'
import { useQuery } from '@future/api-client'
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
import { trpc } from '../../../lib/trpc'

interface PlannerMsSyncGroupsTrpcSlice {
  backfillProgress: {
    query: (input: { tenantId: string; jobId: string }) => Promise<{
      processed: number
      total: number
      completed: boolean
    } | null>
  }
}

export interface BackfillProgressSlideoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string | null
  tenantId: string
}

export function BackfillProgressSlideover({
  open,
  onOpenChange,
  jobId,
  tenantId,
}: BackfillProgressSlideoverProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plannerGroups = (trpc.planner as any).msSync.groups as PlannerMsSyncGroupsTrpcSlice

  const progressQuery = useQuery({
    queryKey: ['planner.msSync.groups.backfillProgress', jobId],
    queryFn: () => plannerGroups.backfillProgress.query({ tenantId, jobId: jobId! }),
    enabled: open && !!jobId,
    refetchInterval: 1000,
  })

  const progress = progressQuery.data

  useEffect(() => {
    if (progress?.completed) {
      onOpenChange(false)
      toast('Backfill complete')
    }
  }, [progress?.completed, onOpenChange])

  const processed = progress?.processed ?? 0
  const total = progress?.total ?? 0
  const pct = total > 0 ? (processed / total) * 100 : 0

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
            {processed} / {total} tasks imported
          </p>
          <Button variant="outline" onClick={handlePause}>
            Pause
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
