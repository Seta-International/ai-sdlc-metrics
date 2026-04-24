import type { ReactNode } from 'react'

interface AdminPageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function AdminPageHeader({ title, description, action }: AdminPageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-h2">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
