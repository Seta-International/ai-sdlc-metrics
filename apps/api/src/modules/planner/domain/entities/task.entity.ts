import type { LabelSlot } from '../value-objects/label-slot.vo'
import type { Progress } from '../value-objects/progress.vo'
import type { Priority } from '../value-objects/priority.vo'
import { DescriptionTooLongException } from '../exceptions/description-too-long.exception'
import { ChecklistLimitReachedException } from '../exceptions/checklist-limit-reached.exception'
import { AssigneeLimitReachedException } from '../exceptions/assignee-limit-reached.exception'
import { TitleRequiredException } from '../exceptions/title-required.exception'
import { TitleTooLongException } from '../exceptions/title-too-long.exception'
import { TaskAssignee } from './task-assignee.value-object'

const MAX_DESCRIPTION_LENGTH = 32_000
const MAX_TITLE_LENGTH = 255
const MAX_ASSIGNEES = 20
const MAX_CHECKLIST_ITEMS = 20

interface TaskProps {
  id: string
  tenantId: string
  planId: string
  bucketId: string
  title: string
  description: string
  progress: 0 | 50 | 100
  priority: 1 | 3 | 5 | 9
  startDate: Date | null
  dueDate: Date | null
  orderHint: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
  completedBy: string | null
  completedAt: Date | null
  deletedAt: Date | null
  checklistItemCount: number
  checklistCheckedCount: number
  assignees: TaskAssignee[]
  appliedLabels: LabelSlot[]
  coverAttachmentId: string | null
  msTaskId: string | null
  msTaskEtag: string | null
  msTaskDetailsEtag: string | null
  pendingMsAssignments: string[]
}

export class Task {
  private _title: string
  private _description: string
  private _progress: 0 | 50 | 100
  private _priority: 1 | 3 | 5 | 9
  private _startDate: Date | null
  private _dueDate: Date | null
  private _orderHint: string
  private _bucketId: string
  private _updatedAt: Date
  private _completedBy: string | null
  private _completedAt: Date | null
  private _deletedAt: Date | null
  private _checklistItemCount: number
  private _checklistCheckedCount: number
  private _assignees: TaskAssignee[]
  private _appliedLabels: LabelSlot[]

  readonly id: string
  readonly tenantId: string
  readonly planId: string
  readonly createdBy: string
  readonly createdAt: Date
  readonly coverAttachmentId: string | null
  readonly msTaskId: string | null
  readonly msTaskEtag: string | null
  readonly msTaskDetailsEtag: string | null
  readonly pendingMsAssignments: string[]

  private constructor(props: TaskProps) {
    this.id = props.id
    this.tenantId = props.tenantId
    this.planId = props.planId
    this._bucketId = props.bucketId
    this._title = props.title
    this._description = props.description
    this._progress = props.progress
    this._priority = props.priority
    this._startDate = props.startDate
    this._dueDate = props.dueDate
    this._orderHint = props.orderHint
    this.createdBy = props.createdBy
    this.createdAt = props.createdAt
    this._updatedAt = props.updatedAt
    this._completedBy = props.completedBy
    this._completedAt = props.completedAt
    this._deletedAt = props.deletedAt
    this._checklistItemCount = props.checklistItemCount
    this._checklistCheckedCount = props.checklistCheckedCount
    this._assignees = props.assignees
    this._appliedLabels = props.appliedLabels
    this.coverAttachmentId = props.coverAttachmentId
    this.msTaskId = props.msTaskId
    this.msTaskEtag = props.msTaskEtag
    this.msTaskDetailsEtag = props.msTaskDetailsEtag
    this.pendingMsAssignments = props.pendingMsAssignments
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  get bucketId(): string {
    return this._bucketId
  }

  get title(): string {
    return this._title
  }

  get description(): string {
    return this._description
  }

  get progress(): 0 | 50 | 100 {
    return this._progress
  }

  get priority(): 1 | 3 | 5 | 9 {
    return this._priority
  }

  get startDate(): Date | null {
    return this._startDate
  }

  get dueDate(): Date | null {
    return this._dueDate
  }

  get orderHint(): string {
    return this._orderHint
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  get completedBy(): string | null {
    return this._completedBy
  }

  get completedAt(): Date | null {
    return this._completedAt
  }

  get deletedAt(): Date | null {
    return this._deletedAt
  }

  get checklistItemCount(): number {
    return this._checklistItemCount
  }

  get checklistCheckedCount(): number {
    return this._checklistCheckedCount
  }

  get assignees(): readonly TaskAssignee[] {
    return this._assignees
  }

  get appliedLabels(): readonly LabelSlot[] {
    return this._appliedLabels
  }

  // ─── Factory methods ──────────────────────────────────────────────────────

  static create(props: {
    id: string
    tenantId: string
    planId: string
    bucketId: string
    title: string
    orderHint: string
    createdBy: string
    description?: string
    priority?: number
  }): Task {
    const now = new Date()
    return new Task({
      id: props.id,
      tenantId: props.tenantId,
      planId: props.planId,
      bucketId: props.bucketId,
      title: props.title,
      description: props.description ?? '',
      progress: 0,
      priority: (props.priority as 1 | 3 | 5 | 9) ?? 5,
      startDate: null,
      dueDate: null,
      orderHint: props.orderHint,
      createdBy: props.createdBy,
      createdAt: now,
      updatedAt: now,
      completedBy: null,
      completedAt: null,
      deletedAt: null,
      checklistItemCount: 0,
      checklistCheckedCount: 0,
      assignees: [],
      appliedLabels: [],
      coverAttachmentId: null,
      msTaskId: null,
      msTaskEtag: null,
      msTaskDetailsEtag: null,
      pendingMsAssignments: [],
    })
  }

  static reconstitute(props: {
    id: string
    tenantId: string
    planId: string
    bucketId: string
    title: string
    description: string
    progress: number
    priority: number
    startDate: Date | null
    dueDate: Date | null
    orderHint: string
    createdBy: string
    createdAt: Date
    updatedAt: Date
    completedBy: string | null
    completedAt: Date | null
    deletedAt: Date | null
    checklistItemCount: number
    checklistCheckedCount: number
    assignees: TaskAssignee[]
    appliedLabels: LabelSlot[]
    coverAttachmentId: string | null
    msTaskId: string | null
    msTaskEtag: string | null
    msTaskDetailsEtag: string | null
    pendingMsAssignments: string[]
  }): Task {
    return new Task({
      id: props.id,
      tenantId: props.tenantId,
      planId: props.planId,
      bucketId: props.bucketId,
      title: props.title,
      description: props.description,
      progress: props.progress as 0 | 50 | 100,
      priority: props.priority as 1 | 3 | 5 | 9,
      startDate: props.startDate,
      dueDate: props.dueDate,
      orderHint: props.orderHint,
      createdBy: props.createdBy,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      completedBy: props.completedBy,
      completedAt: props.completedAt,
      deletedAt: props.deletedAt,
      checklistItemCount: props.checklistItemCount,
      checklistCheckedCount: props.checklistCheckedCount,
      assignees: props.assignees,
      appliedLabels: props.appliedLabels,
      coverAttachmentId: props.coverAttachmentId,
      msTaskId: props.msTaskId,
      msTaskEtag: props.msTaskEtag,
      msTaskDetailsEtag: props.msTaskDetailsEtag,
      pendingMsAssignments: props.pendingMsAssignments,
    })
  }

  // ─── Mutating methods ─────────────────────────────────────────────────────

  rename(title: string): void {
    if (!title || title.length === 0) {
      throw new TitleRequiredException()
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new TitleTooLongException(MAX_TITLE_LENGTH)
    }
    this._title = title
    this._updatedAt = new Date()
  }

  setDescription(description: string): void {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new DescriptionTooLongException(MAX_DESCRIPTION_LENGTH)
    }
    this._description = description
    this._updatedAt = new Date()
  }

  setProgress(progress: Progress): void {
    this._progress = progress.value
    if (progress.value === 100) {
      this._completedAt = new Date()
      // completedBy is set by markCompleted when called directly;
      // setProgress(100) auto-completes but doesn't have an actor,
      // so we only set completedAt here. Command handler must call
      // markCompleted if it needs to capture the actor.
    } else {
      // Reopens if was completed
      this._completedAt = null
      this._completedBy = null
    }
    this._updatedAt = new Date()
  }

  setPriority(priority: Priority): void {
    this._priority = priority.value
    this._updatedAt = new Date()
  }

  setDates(startDate: Date | null, dueDate: Date | null): void {
    this._startDate = startDate
    this._dueDate = dueDate
    this._updatedAt = new Date()
  }

  move(bucketId: string, orderHint: string): void {
    this._bucketId = bucketId
    this._orderHint = orderHint
    this._updatedAt = new Date()
  }

  assign(actorId: string, by: string): void {
    const already = this._assignees.some((a) => a.actorId === actorId)
    if (already) return

    if (this._assignees.length >= MAX_ASSIGNEES) {
      throw new AssigneeLimitReachedException(this.id)
    }

    this._assignees = [...this._assignees, TaskAssignee.create(actorId, by)]
    this._updatedAt = new Date()
  }

  unassign(actorId: string): void {
    const before = this._assignees.length
    this._assignees = this._assignees.filter((a) => a.actorId !== actorId)
    if (this._assignees.length !== before) {
      this._updatedAt = new Date()
    }
  }

  applyLabel(slot: LabelSlot): void {
    const already = this._appliedLabels.some((s) => s.value === slot.value)
    if (already) return
    this._appliedLabels = [...this._appliedLabels, slot]
    this._updatedAt = new Date()
  }

  removeLabel(slot: LabelSlot): void {
    const before = this._appliedLabels.length
    this._appliedLabels = this._appliedLabels.filter((s) => s.value !== slot.value)
    if (this._appliedLabels.length !== before) {
      this._updatedAt = new Date()
    }
  }

  /**
   * Increments the denormalized checklist item counter.
   * The actual ChecklistItem entity is persisted separately and loaded
   * via the repository. This counter mirrors the DB check constraint (≤20).
   */
  addChecklistItem(): void {
    if (this._checklistItemCount >= MAX_CHECKLIST_ITEMS) {
      throw new ChecklistLimitReachedException(this.id)
    }
    this._checklistItemCount++
    this._updatedAt = new Date()
  }

  markCompleted(completedBy: string, completedAt: Date): void {
    this._completedBy = completedBy
    this._completedAt = completedAt
    this._progress = 100
    this._updatedAt = new Date()
  }

  reopen(): void {
    this._completedBy = null
    this._completedAt = null
    this._progress = 0
    this._updatedAt = new Date()
  }

  softDelete(deletedBy: string): void {
    void deletedBy // captured in command handler for the outbox event
    this._deletedAt = new Date()
    this._updatedAt = new Date()
  }
}
