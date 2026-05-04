'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Progress, Skeleton, Button } from '@future/ui'
import { CalendarDays, AlertTriangle, Plus } from '@future/ui/icons'
import { AvatarNameCell } from '../AvatarNameCell'
import type { OnboardingCase } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const STAGE_COLUMNS = [
  { key: 'offer_accepted', label: 'Offer accepted', color: '#7170ff' },
  { key: 'paperwork', label: 'Paperwork', color: '#06b6d4' },
  { key: 'equipment', label: 'Equipment', color: '#f59e0b' },
  { key: 'first_day_ready', label: 'First day ready', color: '#10b981' },
] as const

function OnboardingCaseCard({ c, onClick }: { c: OnboardingCase; onClick: () => void }) {
  const pct = c.tasksTotal > 0 ? Math.round((c.tasksCompleted / c.tasksTotal) * 100) : 0
  return (
    <div
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-border/60 transition-colors"
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <AvatarNameCell fullName={c.employeeName} avatarUrl={c.avatarUrl} subtitle={c.jobTitle} />
      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
        <CalendarDays className="size-3" />
        <span>{c.startDate}</span>
      </div>
      <Progress value={pct} className="h-1 mt-2" />
      <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
        <span>
          {c.tasksCompleted}/{c.tasksTotal} tasks
        </span>
        {c.blockers > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="size-3" />
            {c.blockers}
          </span>
        )}
      </div>
    </div>
  )
}

interface OnboardingKanbanProps {
  onAddClick: () => void
}

export function OnboardingKanban({ onAddClick }: OnboardingKanbanProps) {
  const router = useRouter()
  const [cases, setCases] = React.useState<OnboardingCase[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.onboarding.listCases.query({}) as Promise<
          OnboardingCase[]
        >)
        setCases(result)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const byStage = React.useMemo(() => {
    const map = new Map<string, OnboardingCase[]>()
    for (const col of STAGE_COLUMNS) map.set(col.key, [])
    for (const c of cases) map.get(c.stage)?.push(c)
    return map
  }, [cases])

  return (
    <div className="grid grid-cols-4 gap-2.5 p-4 flex-1 min-h-0 overflow-auto">
      {STAGE_COLUMNS.map((col) => {
        const colCases = byStage.get(col.key) ?? []
        return (
          <div key={col.key} className="flex flex-col gap-2 min-h-0">
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="size-1.5 rounded-full shrink-0" style={{ background: col.color }} />
              <span className="text-xs font-510 text-fg-primary">{col.label}</span>
              <span className="text-xs text-muted-foreground">{colCases.length}</span>
            </div>
            {isLoading
              ? Array.from({ length: 2 }, (_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))
              : colCases.map((c) => (
                  <OnboardingCaseCard
                    key={c.id}
                    c={c}
                    onClick={() => router.push(`/onboarding/${c.id}`)}
                  />
                ))}
            <Button
              variant="outline"
              size="sm"
              className="border-dashed text-muted-foreground gap-1.5 mt-1"
              onClick={onAddClick}
            >
              <Plus className="size-3" /> Add
            </Button>
          </div>
        )
      })}
    </div>
  )
}
