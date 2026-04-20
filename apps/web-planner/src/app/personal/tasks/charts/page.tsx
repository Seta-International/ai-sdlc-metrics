'use client'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { usePersonalCharts } from '@/lib/hooks/use-personal-charts'
import { ProgressDonut } from '@/components/charts/panels/ProgressDonut'
import { PriorityBar } from '@/components/charts/panels/PriorityBar'
import { BucketBar } from '@/components/charts/panels/BucketBar'
import { WorkloadByAssignee } from '@/components/charts/panels/WorkloadByAssignee'
import { LateUpcomingList } from '@/components/charts/panels/LateUpcomingList'
import type { PlannerChartsData } from '@future/api-client/planner'

function isAllZero(d: PlannerChartsData): boolean {
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
  return (
    sum(d.progress) === 0 &&
    sum(d.priority) === 0 &&
    d.bucket.length === 0 &&
    d.workload.length === 0 &&
    d.lateUpcoming.late.length === 0 &&
    d.lateUpcoming.upcoming.length === 0
  )
}

export default function PersonalChartsPage() {
  const { data, isLoading, error } = usePersonalCharts()

  if (isLoading) {
    return (
      <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {['sk-0', 'sk-1', 'sk-2', 'sk-3', 'sk-4'].map((k) => (
          <Skeleton key={k} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load charts.</AlertDescription>
      </Alert>
    )
  }
  if (isAllZero(data)) {
    return (
      <Alert>
        <AlertDescription>
          Nothing assigned to you yet. Tasks from plans you're a member of show up here
          automatically.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      <ProgressDonut counts={data.progress} onDrill={() => {}} />
      <PriorityBar counts={data.priority} onDrill={() => {}} />
      <BucketBar data={data.bucket} onDrill={() => {}} />
      <WorkloadByAssignee rows={data.workload} onDrill={() => {}} />
      <div className="lg:col-span-2">
        <LateUpcomingList
          tasks={[...data.lateUpcoming.late, ...data.lateUpcoming.upcoming]}
          onOpen={() => {}}
        />
      </div>
    </div>
  )
}
