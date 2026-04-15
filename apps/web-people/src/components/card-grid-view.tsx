'use client'

import { useRouter } from 'next/navigation'
import { EmployeeCard } from './employee-card'
import type { DirectoryRow } from '../lib/types'

interface CardGridViewProps {
  employees: DirectoryRow[]
}

export function CardGridView({ employees }: CardGridViewProps) {
  const router = useRouter()

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-sm text-[#8a8f98]">No employees match your filters</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {employees.map((employee) => (
        <EmployeeCard
          key={employee.id}
          employee={employee}
          onClick={(id) => router.push(`/profile/${id}`)}
        />
      ))}
    </div>
  )
}
