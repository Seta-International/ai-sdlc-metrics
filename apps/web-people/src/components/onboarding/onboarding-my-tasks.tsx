// apps/web-people/src/components/onboarding/onboarding-my-tasks.tsx
'use client'

import * as React from 'react'
import { Card, Button } from '@future/ui'
import { CheckCircle2, Clock, AlertTriangle, Upload } from 'lucide-react'
import type { WorkflowTask } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export function OnboardingMyTasks() {
  const [tasks, setTasks] = React.useState<WorkflowTask[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.onboarding.myTasks.query() as Promise<{
          tasks: WorkflowTask[]
        }>)
        setTasks(result.tasks)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading tasks...</div>
  }

  if (tasks.length === 0) {
    return (
      <div className="text-sm text-secondary-foreground/60 py-8 text-center">
        No tasks assigned to you.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <Card key={task.id} className="border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {task.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              ) : task.isOverdue ? (
                <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
              ) : (
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-510 text-foreground">{task.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">For: {task.employeeName}</div>
                {task.dueDate && (
                  <div
                    className={`text-xs mt-0.5 ${task.isOverdue ? 'text-red-400' : 'text-secondary-foreground/60'}`}
                  >
                    Due: {new Date(task.dueDate).toLocaleDateString('en-GB')}
                    {task.isOverdue && ' (overdue)'}
                  </div>
                )}
              </div>
            </div>
            {task.status === 'pending' && (
              <div className="flex gap-2 shrink-0">
                <Button variant="default" size="sm" className="gap-1 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complete
                </Button>
                {task.linkedDocumentRequirement && (
                  <Button variant="outline" size="sm" className="gap-1 text-xs">
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
