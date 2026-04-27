import type { SyncableTaskField } from '@future/event-contracts'

const RENAMED: Partial<Record<SyncableTaskField, string>> = {
  startDate: 'startDateTime',
  dueDate: 'dueDateTime',
  completedDate: 'completedDateTime',
  assignees: 'assignments',
}

export function mapDomainFieldToMsField(field: SyncableTaskField): string {
  return RENAMED[field] ?? field
}
