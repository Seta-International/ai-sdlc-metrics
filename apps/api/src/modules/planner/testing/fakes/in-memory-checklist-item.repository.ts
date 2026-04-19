import type { IChecklistItemRepository } from '../../domain/repositories/checklist-item.repository'
import type { ChecklistItem } from '../../domain/entities/checklist-item.value-object'

interface Counters {
  itemCount: number
  checkedCount: number
}

export class InMemoryChecklistItemRepository implements IChecklistItemRepository {
  private readonly items = new Map<string, ChecklistItem[]>()
  private readonly counters = new Map<string, Counters>()

  private getCounters(taskId: string): Counters {
    if (!this.counters.has(taskId)) {
      this.counters.set(taskId, { itemCount: 0, checkedCount: 0 })
    }
    return this.counters.get(taskId)!
  }

  async addItem(
    taskId: string,
    _tenantId: string,
    item: ChecklistItem,
    _createdBy: string,
    _expectedVersion?: string,
  ): Promise<void> {
    const existing = this.items.get(taskId) ?? []
    this.items.set(taskId, [...existing, item])
    const c = this.getCounters(taskId)
    c.itemCount++
  }

  async toggleItem(
    taskId: string,
    _tenantId: string,
    itemId: string,
    isChecked: boolean,
    _expectedVersion?: string,
  ): Promise<void> {
    const list = this.items.get(taskId) ?? []
    const updated = list.map((i) => (i.id === itemId ? i.withChecked(isChecked) : i))
    this.items.set(taskId, updated)
    const c = this.getCounters(taskId)
    if (isChecked) {
      c.checkedCount++
    } else {
      c.checkedCount--
    }
  }

  async updateItem(
    taskId: string,
    _tenantId: string,
    itemId: string,
    title: string,
    _expectedVersion?: string,
  ): Promise<void> {
    const list = this.items.get(taskId) ?? []
    this.items.set(
      taskId,
      list.map((i) => (i.id === itemId ? i.withTitle(title) : i)),
    )
  }

  async removeItem(
    taskId: string,
    _tenantId: string,
    itemId: string,
    _expectedVersion?: string,
  ): Promise<void> {
    const list = this.items.get(taskId) ?? []
    const item = list.find((i) => i.id === itemId)
    if (!item) return
    this.items.set(
      taskId,
      list.filter((i) => i.id !== itemId),
    )
    const c = this.getCounters(taskId)
    c.itemCount--
    if (item.isChecked) {
      c.checkedCount--
    }
  }

  async reorderItem(
    taskId: string,
    _tenantId: string,
    itemId: string,
    orderHint: string,
  ): Promise<void> {
    const list = this.items.get(taskId) ?? []
    this.items.set(
      taskId,
      list.map((i) => (i.id === itemId ? i.withOrderHint(orderHint) : i)),
    )
  }

  async listByTask(taskId: string, _tenantId: string): Promise<ChecklistItem[]> {
    return this.items.get(taskId) ?? []
  }

  /** Test helpers */
  getItemCount(taskId: string): number {
    return this.getCounters(taskId).itemCount
  }

  getCheckedCount(taskId: string): number {
    return this.getCounters(taskId).checkedCount
  }

  clear(): void {
    this.items.clear()
    this.counters.clear()
  }
}
