'use client'

import { Badge } from '@future/ui'
import type { EmploymentStatus } from '../lib/types'

const statusConfig: Record<
  EmploymentStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  active: { label: 'Active', variant: 'default' },
  pre_hire: { label: 'Pre-hire', variant: 'secondary' },
  on_leave: { label: 'On Leave', variant: 'outline' },
  suspended: { label: 'Suspended', variant: 'secondary' },
  notice_period: { label: 'Notice Period', variant: 'outline' },
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
