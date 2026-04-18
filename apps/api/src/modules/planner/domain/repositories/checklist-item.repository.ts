import type { ChecklistItem } from '../entities/checklist-item.value-object'

export const CHECKLIST_ITEM_REPOSITORY = 'CHECKLIST_ITEM_REPOSITORY'

export interface IChecklistItemRepository {
  addItem(taskId: string, tenantId: string, item: ChecklistItem, createdBy: string): Promise<void>
  toggleItem(taskId: string, tenantId: string, itemId: string, isChecked: boolean): Promise<void>
  updateItem(taskId: string, tenantId: string, itemId: string, title: string): Promise<void>
  removeItem(taskId: string, tenantId: string, itemId: string): Promise<void>
  reorderItem(taskId: string, tenantId: string, itemId: string, orderHint: string): Promise<void>
  listByTask(taskId: string, tenantId: string): Promise<ChecklistItem[]>
}
