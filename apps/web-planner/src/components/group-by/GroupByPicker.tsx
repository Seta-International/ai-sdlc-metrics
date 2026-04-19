'use client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@future/ui'
import { useViewState } from '@/lib/hooks/useViewState'
import { GROUP_KEYS, type GroupKey } from '@/lib/view-state'

const GROUP_LABELS: Record<GroupKey, string> = {
  bucket: 'Bucket',
  progress: 'Progress',
  due: 'Due date',
  priority: 'Priority',
  assignee: 'Assignee',
  label: 'Label',
}

export function GroupByPicker({ planId }: { planId: string }) {
  const { state, patch } = useViewState({ planId })

  return (
    <Select value={state.groupBy} onValueChange={(v) => patch({ groupBy: v as GroupKey })}>
      <SelectTrigger className="w-40" data-testid="group-by-trigger">
        <SelectValue placeholder="Group by…" />
      </SelectTrigger>
      <SelectContent>
        {GROUP_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            {GROUP_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
