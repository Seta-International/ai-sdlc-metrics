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
  plan: 'Plan',
}

const DEFAULT_KEYS = GROUP_KEYS.filter((k) => k !== 'plan')

export function GroupByPicker({
  planId,
  availableKeys,
}: {
  planId: string
  availableKeys?: GroupKey[]
}) {
  const { state, patch } = useViewState({ planId })
  const keys = availableKeys ?? DEFAULT_KEYS

  return (
    <Select value={state.groupBy} onValueChange={(v) => patch({ groupBy: v as GroupKey })}>
      <SelectTrigger className="w-40" data-testid="group-by-trigger">
        <SelectValue placeholder="Group by…" />
      </SelectTrigger>
      <SelectContent>
        {keys.map((key) => (
          <SelectItem key={key} value={key}>
            {GROUP_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
