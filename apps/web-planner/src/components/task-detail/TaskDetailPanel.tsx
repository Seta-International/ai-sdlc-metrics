'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Separator } from '@future/ui'
import { TaskPanelHeader } from './TaskPanelHeader'
import { TaskPropertyStrip } from './TaskPropertyStrip'
import { TaskDescription } from './TaskDescription'
import { TaskChecklist } from './TaskChecklist'

interface Props {
  taskId: string
  planId: string
}

const FIXTURE_TASK = {
  title: 'Sample task',
  description: '',
  progress: 0 as 0 | 50 | 100,
  priority: 3 as 1 | 3 | 5 | 9,
  bucketName: 'To Do',
  startDate: null,
  dueDate: null,
  appliedLabels: [] as string[],
  assignees: [] as { actorId: string; name?: string }[],
}

interface PlaceholderSectionProps {
  title: string
  phase: string
}

function PlaceholderSection({ title, phase }: PlaceholderSectionProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <span className="text-xs text-muted-foreground">Coming in {phase}</span>
    </div>
  )
}

export function TaskDetailPanel({ taskId: _taskId, planId: _planId }: Props) {
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
      <TaskPanelHeader title={FIXTURE_TASK.title} isSaving={false} onClose={() => router.back()} />

      <div className="flex-1 overflow-y-auto">
        <TaskPropertyStrip
          bucketName={FIXTURE_TASK.bucketName}
          progress={FIXTURE_TASK.progress}
          priority={FIXTURE_TASK.priority}
          appliedLabels={FIXTURE_TASK.appliedLabels}
          planLabels={[]}
          assignees={FIXTURE_TASK.assignees}
          startDate={FIXTURE_TASK.startDate}
          dueDate={FIXTURE_TASK.dueDate}
        />

        <Separator />

        <TaskDescription value={FIXTURE_TASK.description} onChange={() => undefined} />

        <Separator />

        <TaskChecklist />

        <Separator />

        <PlaceholderSection title="Attachments" phase="Phase 1.6" />

        <Separator />

        <PlaceholderSection title="Comments" phase="Phase 1.7" />

        <Separator />

        <PlaceholderSection title="Evidence" phase="Phase 1.8" />
      </div>
    </div>
  )
}
