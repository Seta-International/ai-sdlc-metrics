'use client'

import { Card } from '@future/ui'
import Image from 'next/image'
import { MapPin, Building2 } from 'lucide-react'
import { StatusBadge } from './status-badge'
import type { DirectoryRow } from '../lib/types'

interface EmployeeCardProps {
  employee: DirectoryRow
  onClick: (employmentId: string) => void
}

export function EmployeeCard({ employee, onClick }: EmployeeCardProps) {
  const initials = employee.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card
      className="cursor-pointer border-border bg-card p-4 transition-colors hover:bg-secondary/50"
      onClick={() => onClick(employee.id)}
    >
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-secondary/50 text-lg font-510 text-secondary-foreground">
          {employee.avatarUrl ? (
            <Image
              src={employee.avatarUrl}
              alt={employee.fullName}
              width={64}
              height={64}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Name + Title */}
        <div className="mb-1 text-sm font-510 text-foreground truncate max-w-full">
          {employee.fullName}
        </div>
        <div className="mb-3 text-xs text-muted-foreground truncate max-w-full">
          {employee.jobTitle}
        </div>

        {/* Department + Location */}
        <div className="flex flex-col gap-1 text-xs text-secondary-foreground/60 w-full">
          <div className="flex items-center justify-center gap-1 truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{employee.department}</span>
          </div>
          {employee.location && (
            <div className="flex items-center justify-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{employee.location}</span>
            </div>
          )}
        </div>

        {/* Status + Work Arrangement */}
        <div className="mt-3 flex items-center gap-2">
          <StatusBadge status={employee.employmentStatus} />
          {employee.workArrangement && (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-510 text-secondary-foreground">
              {employee.workArrangement.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
