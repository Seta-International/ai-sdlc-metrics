'use client'

import { Card } from '@future/ui'
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
      className="cursor-pointer border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
      onClick={() => onClick(employee.id)}
    >
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-lg font-[510] text-[#d0d6e0]">
          {employee.avatarUrl ? (
            <img
              src={employee.avatarUrl}
              alt={employee.fullName}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Name + Title */}
        <div className="mb-1 text-sm font-[510] text-[#f7f8f8] truncate max-w-full">
          {employee.fullName}
        </div>
        <div className="mb-3 text-xs text-[#8a8f98] truncate max-w-full">{employee.jobTitle}</div>

        {/* Department + Location */}
        <div className="flex flex-col gap-1 text-xs text-[#62666d] w-full">
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
            <span className="rounded-full border border-[#23252a] px-2 py-0.5 text-[10px] font-[510] text-[#d0d6e0]">
              {employee.workArrangement.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
