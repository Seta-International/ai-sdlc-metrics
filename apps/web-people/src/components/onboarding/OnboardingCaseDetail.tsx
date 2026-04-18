// apps/web-people/src/components/onboarding/onboarding-case-detail.tsx
'use client'

import * as React from 'react'
import { Card, Badge, Button, Progress, Separator, Skeleton } from '@future/ui'
import { CheckCircle2, Clock, SkipForward } from 'lucide-react'
import { AvatarNameCell } from '../AvatarNameCell'
import type { OnboardingCase, WorkflowTask } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface OnboardingCaseDetailProps {
  caseId: string
}

export function OnboardingCaseDetail({ caseId }: OnboardingCaseDetailProps) {
  const [caseData, setCaseData] = React.useState<OnboardingCase | null>(null)
  const [tasks, setTasks] = React.useState<WorkflowTask[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.onboarding.getCase.query({
          caseId,
        }) as Promise<{ caseData: OnboardingCase; tasks: WorkflowTask[] }>)
        setCaseData(result.caseData)
        setTasks(result.tasks)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [caseId])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!caseData) {
    return <p className="text-sm text-muted-foreground">Case not found.</p>
  }

  const pct =
    caseData.tasksTotal > 0 ? Math.round((caseData.tasksCompleted / caseData.tasksTotal) * 100) : 0

  // Group tasks by assignee role
  const grouped = tasks.reduce<Record<string, WorkflowTask[]>>((acc, t) => {
    const role = t.assigneeRole || 'Unassigned'
    if (!acc[role]) acc[role] = []
    acc[role].push(t)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <AvatarNameCell
            fullName={caseData.employeeName}
            avatarUrl={caseData.avatarUrl}
            subtitle={caseData.templateName}
          />
          <Badge variant="default">{caseData.status.replace('_', ' ')}</Badge>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-sm font-510 text-secondary-foreground">{pct}%</span>
        </div>
        <div className="mt-2 text-xs text-secondary-foreground/60">
          {caseData.tasksCompleted} of {caseData.tasksTotal} tasks completed
        </div>
      </Card>

      {/* Tasks grouped by role */}
      {Object.entries(grouped).map(([role, roleTasks]) => (
        <div key={role}>
          <h3 className="text-sm font-590 text-foreground mb-3 capitalize">
            {role.replace('_', ' ')} Tasks
          </h3>
          <div className="space-y-2">
            {roleTasks.map((task) => (
              <Card key={task.id} className="border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : task.status === 'skipped' ? (
                      <SkipForward className="h-4 w-4 text-secondary-foreground/60 mt-0.5 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-secondary-foreground">
                        {task.title}
                        {task.isRequired && (
                          <Badge variant="destructive" className="ml-2 h-4 px-1 text-tiny">
                            Required
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <div className="text-xs text-secondary-foreground/60 mt-0.5">
                          {task.description}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-secondary-foreground/60 mt-1">
                        {task.assigneeName && <span>Assigned: {task.assigneeName}</span>}
                        {task.dueDate && (
                          <span className={task.isOverdue ? 'text-red-400' : ''}>
                            Due: {new Date(task.dueDate).toLocaleDateString('en-GB')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {task.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="default" size="sm" className="h-7 text-xs">
                        Complete
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        Skip
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Separator className="opacity-20" />
    </div>
  )
}
