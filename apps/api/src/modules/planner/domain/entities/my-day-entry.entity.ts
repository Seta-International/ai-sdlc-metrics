export interface MyDayEntryProps {
  actorId: string
  taskId: string
  addedDate: string // YYYY-MM-DD
  addedAt: Date
  completedAt: Date | null
  tenantId: string
}

export class MyDayEntry {
  public readonly actorId: string
  public readonly taskId: string
  public readonly addedDate: string
  public readonly addedAt: Date
  public readonly tenantId: string
  public completedAt: Date | null

  constructor(props: MyDayEntryProps) {
    this.actorId = props.actorId
    this.taskId = props.taskId
    this.addedDate = props.addedDate
    this.addedAt = props.addedAt
    this.completedAt = props.completedAt
    this.tenantId = props.tenantId
  }

  markCompleted(now: Date): void {
    if (this.completedAt !== null) return
    this.completedAt = now
  }
}
