'use client'

import { Card, Button, Separator } from '@future/ui'
import { CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react'
import type { ProbationRecord } from '../../lib/types'

const probationStatusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> =
  {
    in_progress: { label: 'In Probation', icon: Clock, color: 'text-amber-400' },
    passed: { label: 'Passed', icon: CheckCircle2, color: 'text-[#10b981]' },
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
  const config = probationStatusConfig[probation.status] ?? probationStatusConfig.in_progress
  const Icon = config.icon
  const daysRemaining = Math.ceil(
    (new Date(probation.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] ${config.color}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-[510] text-[#f7f8f8]">{config.label}</div>
            {probation.status === 'in_progress' && (
              <div className="text-sm text-[#8a8f98]">
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
            <dt className="text-xs text-[#8a8f98]">Start Date</dt>
            <dd className="text-[#d0d6e0]">
              {new Date(probation.startDate).toLocaleDateString('en-GB')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#8a8f98]">End Date</dt>
            <dd className="text-[#d0d6e0]">
              {new Date(probation.endDate).toLocaleDateString('en-GB')}
            </dd>
          </div>
          {probation.originalEndDate !== probation.endDate && (
            <div>
              <dt className="text-xs text-[#8a8f98]">Original End Date</dt>
              <dd className="text-[#d0d6e0] line-through">
                {new Date(probation.originalEndDate).toLocaleDateString('en-GB')}
              </dd>
            </div>
          )}
          {probation.salaryPercentage != null && (
            <div>
              <dt className="text-xs text-[#8a8f98]">Salary Rate</dt>
              <dd className="text-[#d0d6e0]">{probation.salaryPercentage}% of full salary</dd>
            </div>
          )}
        </dl>
      </Card>

      {probation.extensions.length > 0 && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-3">Extensions</h3>
          <div className="space-y-2">
            {probation.extensions.map((ext, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm rounded border border-[rgba(255,255,255,0.05)] p-3"
              >
                <div>
                  <div className="text-[#d0d6e0]">
                    Extended to {new Date(ext.extendedDate).toLocaleDateString('en-GB')}
                  </div>
                  <div className="text-xs text-[#62666d]">{ext.reason}</div>
                </div>
                <div className="text-xs text-[#62666d]">by {ext.extendedBy}</div>
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
