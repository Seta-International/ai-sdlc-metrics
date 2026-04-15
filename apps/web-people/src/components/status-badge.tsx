'use client'

import { Badge } from '@future/ui'
import type { EmploymentStatus } from '../lib/types'

const statusConfig: Record<
  EmploymentStatus,
  { label: string; variant: 'default' | 'subtle' | 'destructive' | 'info' | 'warning' }
> = {
  active: { label: 'Active', variant: 'default' },
  pre_hire: { label: 'Pre-hire', variant: 'info' },
  on_leave: { label: 'On Leave', variant: 'warning' },
  suspended: { label: 'Suspended', variant: 'subtle' },
  notice_period: { label: 'Notice Period', variant: 'warning' },
  terminated: { label: 'Terminated', variant: 'destructive' },
}

interface StatusBadgeProps {
  status: EmploymentStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}
