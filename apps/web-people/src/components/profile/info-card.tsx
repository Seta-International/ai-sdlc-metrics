'use client'

import { Card, Button } from '@future/ui'
import { Edit } from 'lucide-react'

interface InfoCardProps {
  title: string
  children: React.ReactNode
  editable?: boolean
  onEdit?: () => void
}

export function InfoCard({ title, children, editable, onEdit }: InfoCardProps) {
  return (
    <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-[590] text-[#f7f8f8]">{title}</h3>
        {editable && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 gap-1 text-xs">
            <Edit className="h-3 w-3" />
            Edit
          </Button>
        )}
      </div>
      {children}
    </Card>
  )
}
