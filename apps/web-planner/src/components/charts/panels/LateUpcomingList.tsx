'use client'
import { AlertTriangle, Clock } from 'lucide-react'
import { reduceLateUpcoming } from '@/lib/charts-data'
import type { TaskFlat } from '@future/api-client/planner'

function Section({
  icon: Icon,
  title,
  items,
  onOpen,
}: {
  icon: typeof AlertTriangle
  title: string
  items: TaskFlat[]
  onOpen: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4" />
        {title}
      </div>
      <ul className="space-y-1">
        {items.map((t) => (
          <li key={t.id}>
            <button
              className="w-full truncate text-left text-sm hover:text-primary"
              onClick={() => onOpen(t.id)}
              type="button"
            >
              {t.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LateUpcomingList({
  tasks,
  onOpen,
}: {
  tasks: TaskFlat[]
  onOpen: (taskId: string) => void
}) {
  const { late, upcoming } = reduceLateUpcoming(tasks)
  return (
    <div className="rounded-lg border border-border p-4">
      <Section icon={AlertTriangle} title="Late" items={late} onOpen={onOpen} />
      <Section icon={Clock} title="Upcoming (next 7 days)" items={upcoming} onOpen={onOpen} />
    </div>
  )
}
