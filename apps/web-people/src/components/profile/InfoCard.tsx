'use client'

import { Card, Button } from '@future/ui'
import { Edit } from '@future/ui/icons'

interface InfoCardProps {
  title: string
  children: React.ReactNode
  editable?: boolean
  onEdit?: () => void
}

export function InfoCard({ title, children, editable, onEdit }: InfoCardProps) {
  return (
    <Card className="border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-590 text-foreground">{title}</h3>
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
