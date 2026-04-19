'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  reduceProgress,
  reducePriority,
  reduceBucket,
  reduceWorkloadByAssignee,
} from '@/lib/charts-data'
import { ProgressDonut } from './panels/ProgressDonut'
import { PriorityBar } from './panels/PriorityBar'
import { BucketBar } from './panels/BucketBar'
import { WorkloadByAssignee } from './panels/WorkloadByAssignee'
import { LateUpcomingList } from './panels/LateUpcomingList'
import { buildDrillThroughUrl } from './DrillThrough'
import { Alert, AlertDescription } from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'

export function ChartsGrid({ planId, tasks }: { planId: string; tasks: TaskFlat[] }) {
  const router = useRouter()
  const drill = (payload: Parameters<typeof buildDrillThroughUrl>[1]) =>
    router.replace(buildDrillThroughUrl(planId, payload), { scroll: false })

  const progress = useMemo(() => reduceProgress(tasks), [tasks])
  const priority = useMemo(() => reducePriority(tasks), [tasks])
  const bucket = useMemo(() => reduceBucket(tasks), [tasks])
  const workload = useMemo(() => reduceWorkloadByAssignee(tasks), [tasks])

  if (tasks.length === 0) {
    return (
      <Alert>
        <AlertDescription>No tasks match the current filters.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      <ProgressDonut counts={progress} onDrill={drill} />
      <PriorityBar counts={priority} onDrill={drill} />
      <BucketBar data={bucket} onDrill={drill} />
      <WorkloadByAssignee rows={workload} onDrill={drill} />
      <div className="lg:col-span-2">
        <LateUpcomingList
          tasks={tasks}
          onOpen={(id) => router.push(`/plans/${planId}/grid?open=${id}`)}
        />
      </div>
    </div>
  )
}
