'use client'

import * as React from 'react'
import { Card, Button, Separator } from '@future/ui'
import { CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react'
import type { ProbationRecord } from '../../lib/types'

const probationStatusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> =
  {
    in_progress: { label: 'In Probation', icon: Clock, color: 'text-amber-400' },
    passed: { label: 'Passed', icon: CheckCircle2, color: 'text-emerald-500' },
    failed: { label: 'Failed', icon: XCircle, color: 'text-red-400' },
    extended: { label: 'Extended', icon: AlertTriangle, color: 'text-amber-400' },
  }

export function TabProbation({
  probation,
  canManage,
}: {
  probation: ProbationRecord
  canManage: boolean
}) {
  const config = probationStatusConfig[probation.status] ?? {
    label: 'In Probation',
    icon: Clock,
    color: 'text-amber-400',
  }
  const Icon = config.icon
  const daysRemaining = React.useMemo(
    () => Math.ceil((new Date(probation.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    [probation.endDate],
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-secondary/50 ${config.color}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-510 text-foreground">{config.label}</div>
            {probation.status === 'in_progress' && (
              <div className="text-sm text-muted-foreground">
                {daysRemaining > 0
                  ? `${daysRemaining} days remaining`
                  : `${Math.abs(daysRemaining)} days overdue`}
              </div>
            )}
          </div>
        </div>
        <Separator className="my-4" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Start Date</dt>
            <dd className="text-secondary-foreground">
              {new Date(probation.startDate).toLocaleDateString('en-GB')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">End Date</dt>
            <dd className="text-secondary-foreground">
              {new Date(probation.endDate).toLocaleDateString('en-GB')}
            </dd>
          </div>
          {probation.originalEndDate !== probation.endDate && (
            <div>
              <dt className="text-xs text-muted-foreground">Original End Date</dt>
              <dd className="text-secondary-foreground line-through">
                {new Date(probation.originalEndDate).toLocaleDateString('en-GB')}
              </dd>
            </div>
          )}
          {probation.salaryPercentage != null && (
            <div>
              <dt className="text-xs text-muted-foreground">Salary Rate</dt>
              <dd className="text-secondary-foreground">
                {probation.salaryPercentage}% of full salary
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {probation.extensions.length > 0 && (
        <Card className="border-border bg-card p-5">
          <h3 className="text-sm font-590 text-foreground mb-3">Extensions</h3>
          <div className="space-y-2">
            {probation.extensions.map((ext) => (
              <div
                key={`${ext.extendedDate}-${ext.reason}`}
                className="flex items-center justify-between text-sm rounded border border-sidebar-border p-3"
              >
                <div>
                  <div className="text-secondary-foreground">
                    Extended to {new Date(ext.extendedDate).toLocaleDateString('en-GB')}
                  </div>
                  <div className="text-xs text-secondary-foreground/60">{ext.reason}</div>
                </div>
                <div className="text-xs text-secondary-foreground/60">by {ext.extendedBy}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {canManage && probation.status === 'in_progress' && (
        <div className="flex gap-2">
          <Button variant="default" className="gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Confirm Probation
          </Button>
          <Button variant="outline" className="gap-1">
            <Clock className="h-4 w-4" />
            Extend
          </Button>
          <Button
            variant="outline"
            className="gap-1 text-red-400 border-red-400/30 hover:bg-red-400/10"
          >
            <XCircle className="h-4 w-4" />
            Fail
          </Button>
        </div>
      )}
    </div>
  )
}
