'use client'

import { useState } from 'react'
import { Input } from '@future/ui'

interface Task {
  id: string
  title: string
}

interface Props {
  tasks: Task[]
  onSelect: (taskId: string) => void
  excludeId: string
}

export function TaskSearchPicker({ tasks, onSelect, excludeId }: Props) {
  const [search, setSearch] = useState('')

  const filtered = tasks
    .filter((t) => t.id !== excludeId)
    .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Search tasks..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8"
      />
      <ul className="max-h-48 overflow-y-auto rounded border border-border">
        {filtered.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => onSelect(task.id)}
            >
              {task.title}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-fg-muted">No tasks found</li>
        )}
      </ul>
    </div>
  )
}
