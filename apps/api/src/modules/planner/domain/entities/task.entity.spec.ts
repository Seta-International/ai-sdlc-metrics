import { describe, expect, it } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { Task } from './task.entity'
import { TaskAssignee } from './task-assignee.value-object'
import { ChecklistItem } from './checklist-item.value-object'
import { LabelSlot } from '../value-objects/label-slot.vo'
import { MsOrderHint } from '../value-objects/ms-order-hint.vo'
import { Progress } from '../value-objects/progress.vo'
import { Priority } from '../value-objects/priority.vo'
import { ChecklistLimitReachedException } from '../exceptions/checklist-limit-reached.exception'
import { AssigneeLimitReachedException } from '../exceptions/assignee-limit-reached.exception'
import { DescriptionTooLongException } from '../exceptions/description-too-long.exception'
import { TitleRequiredException } from '../exceptions/title-required.exception'
import { TitleTooLongException } from '../exceptions/title-too-long.exception'

const TENANT_ID = uuidv7()
const PLAN_ID = uuidv7()
const BUCKET_ID = uuidv7()
const ACTOR_ID = uuidv7()

function makeTask(overrides?: Partial<Parameters<typeof Task.create>[0]>): Task {
  return Task.create({
    id: uuidv7(),
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Test Task',
    orderHint: MsOrderHint.between(),
    createdBy: ACTOR_ID,
    ...overrides,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// TaskAssignee value object
// ────────────────────────────────────────────────────────────────────────────

describe('TaskAssignee value object', () => {
  it('is immutable — properties are readonly', () => {
    const a = TaskAssignee.create('actor-1', 'assigner-1')
    expect(a.actorId).toBe('actor-1')
    expect(a.assignedBy).toBe('assigner-1')
    expect(a.assignedAt).toBeInstanceOf(Date)
  })

  it('equals() is true for same actorId', () => {
    const a = TaskAssignee.create('actor-1', 'assigner-1')
    const b = TaskAssignee.create('actor-1', 'assigner-2')
    expect(a.equals(b)).toBe(true)
  })

  it('equals() is false for different actorId', () => {
    const a = TaskAssignee.create('actor-1', 'assigner-1')
    const b = TaskAssignee.create('actor-2', 'assigner-1')
    expect(a.equals(b)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Task.create() / reconstitute()
// ────────────────────────────────────────────────────────────────────────────

describe('Task aggregate', () => {
  describe('Task.create()', () => {
    it('creates task with correct defaults', () => {
      const id = uuidv7()
      const task = Task.create({
        id,
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        bucketId: BUCKET_ID,
        title: 'New Task',
        orderHint: MsOrderHint.between(),
        createdBy: ACTOR_ID,
      })

      expect(task.id).toBe(id)
      expect(task.tenantId).toBe(TENANT_ID)
      expect(task.planId).toBe(PLAN_ID)
      expect(task.bucketId).toBe(BUCKET_ID)
      expect(task.title).toBe('New Task')
      expect(task.description).toBe('')
      expect(task.progress).toBe(0)
      expect(task.priority).toBe(5)
      expect(task.createdBy).toBe(ACTOR_ID)
      expect(task.completedBy).toBeNull()
      expect(task.completedAt).toBeNull()
      expect(task.deletedAt).toBeNull()
      expect(task.startDate).toBeNull()
      expect(task.dueDate).toBeNull()
      expect(task.assignees).toHaveLength(0)
      expect(task.appliedLabels).toHaveLength(0)
      expect(task.checklistItemCount).toBe(0)
      expect(task.checklistCheckedCount).toBe(0)
    })
  })

  describe('Task.reconstitute()', () => {
    it('restores all fields from persistence', () => {
      const id = uuidv7()
      const now = new Date()
      const completedAt = new Date()
      const task = Task.reconstitute({
        id,
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        bucketId: BUCKET_ID,
        title: 'Restored Task',
        description: 'Some description',
        progress: 100,
        priority: 9,
        startDate: now,
        dueDate: now,
        orderHint: ' !',
        createdBy: ACTOR_ID,
        createdAt: now,
        updatedAt: now,
        completedBy: ACTOR_ID,
        completedAt,
        deletedAt: null,
        checklistItemCount: 3,
        checklistCheckedCount: 2,
        assignees: [TaskAssignee.create('a1', 'a2')],
        appliedLabels: [LabelSlot.of('category1')],
        coverAttachmentId: null,
        msTaskId: null,
        msTaskEtag: null,
        msTaskDetailsEtag: null,
        pendingMsAssignments: [],
      })

      expect(task.id).toBe(id)
      expect(task.description).toBe('Some description')
      expect(task.progress).toBe(100)
      expect(task.priority).toBe(9)
      expect(task.completedBy).toBe(ACTOR_ID)
      expect(task.completedAt).toBe(completedAt)
      expect(task.assignees).toHaveLength(1)
      expect(task.appliedLabels).toHaveLength(1)
      expect(task.checklistItemCount).toBe(3)
      expect(task.checklistCheckedCount).toBe(2)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // rename()
  // ──────────────────────────────────────────────────────────────────────────

  describe('rename()', () => {
    it('updates the title', () => {
      const task = makeTask()
      task.rename('Updated Title')
      expect(task.title).toBe('Updated Title')
    })

    it('throws when title is empty', () => {
      const task = makeTask()
      expect(() => task.rename('')).toThrow()
    })

    it('throws when title exceeds 255 chars', () => {
      const task = makeTask()
      expect(() => task.rename('x'.repeat(256))).toThrow()
    })

    it('accepts exactly 255 chars', () => {
      const task = makeTask()
      expect(() => task.rename('x'.repeat(255))).not.toThrow()
      expect(task.title).toBe('x'.repeat(255))
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // setDescription()
  // ──────────────────────────────────────────────────────────────────────────

  describe('setDescription()', () => {
    it('sets description', () => {
      const task = makeTask()
      task.setDescription('My description')
      expect(task.description).toBe('My description')
    })

    it('allows empty description', () => {
      const task = makeTask()
      task.setDescription('')
      expect(task.description).toBe('')
    })

    it('allows exactly 32000 chars', () => {
      const task = makeTask()
      expect(() => task.setDescription('x'.repeat(32000))).not.toThrow()
    })

    it('throws DescriptionTooLongException for 32001 chars', () => {
      const task = makeTask()
      expect(() => task.setDescription('x'.repeat(32001))).toThrow(DescriptionTooLongException)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // setProgress()
  // ──────────────────────────────────────────────────────────────────────────

  describe('setProgress()', () => {
    it('sets progress to 0', () => {
      const task = makeTask()
      task.setProgress(Progress.of(0))
      expect(task.progress).toBe(0)
    })

    it('sets progress to 50', () => {
      const task = makeTask()
      task.setProgress(Progress.of(50))
      expect(task.progress).toBe(50)
      expect(task.completedAt).toBeNull()
    })

    it('progress 100 auto-completes the task — sets completedAt', () => {
      const task = makeTask()
      task.setProgress(Progress.of(100))
      expect(task.progress).toBe(100)
      expect(task.completedAt).toBeInstanceOf(Date)
    })

    it('setting progress < 100 on a completed task clears completedAt (reopens)', () => {
      const task = makeTask()
      task.setProgress(Progress.of(100))
      expect(task.completedAt).not.toBeNull()

      task.setProgress(Progress.of(50))
      expect(task.progress).toBe(50)
      expect(task.completedAt).toBeNull()
      expect(task.completedBy).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // setPriority()
  // ──────────────────────────────────────────────────────────────────────────

  describe('setPriority()', () => {
    it('sets priority to 1', () => {
      const task = makeTask()
      task.setPriority(Priority.of(1))
      expect(task.priority).toBe(1)
    })

    it('sets priority to 9', () => {
      const task = makeTask()
      task.setPriority(Priority.of(9))
      expect(task.priority).toBe(9)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // setDates()
  // ──────────────────────────────────────────────────────────────────────────

  describe('setDates()', () => {
    it('sets startDate and dueDate', () => {
      const task = makeTask()
      const start = new Date('2026-04-01')
      const due = new Date('2026-04-30')
      task.setDates(start, due)
      expect(task.startDate).toEqual(start)
      expect(task.dueDate).toEqual(due)
    })

    it('accepts null dates', () => {
      const task = makeTask()
      task.setDates(null, null)
      expect(task.startDate).toBeNull()
      expect(task.dueDate).toBeNull()
    })

    it('accepts partial dates (startDate only)', () => {
      const task = makeTask()
      task.setDates(new Date(), null)
      expect(task.startDate).toBeInstanceOf(Date)
      expect(task.dueDate).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // move()
  // ──────────────────────────────────────────────────────────────────────────

  describe('move()', () => {
    it('changes bucketId and orderHint', () => {
      const task = makeTask()
      const newBucketId = uuidv7()
      const newHint = MsOrderHint.between(undefined, undefined)
      task.move(newBucketId, newHint)
      expect(task.bucketId).toBe(newBucketId)
      expect(task.orderHint).toBe(newHint)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // assign() / unassign()
  // ──────────────────────────────────────────────────────────────────────────

  describe('assign()', () => {
    it('adds an assignee', () => {
      const task = makeTask()
      const actorId = uuidv7()
      task.assign(actorId, ACTOR_ID)
      expect(task.assignees).toHaveLength(1)
      expect(task.assignees[0].actorId).toBe(actorId)
      expect(task.assignees[0].assignedBy).toBe(ACTOR_ID)
    })

    it('is idempotent — re-assigning the same actor does not duplicate', () => {
      const task = makeTask()
      const actorId = uuidv7()
      task.assign(actorId, ACTOR_ID)
      task.assign(actorId, ACTOR_ID)
      expect(task.assignees).toHaveLength(1)
    })

    it('throws AssigneeLimitReachedException on 21st distinct assignee', () => {
      const task = makeTask()
      for (let i = 0; i < 20; i++) {
        task.assign(uuidv7(), ACTOR_ID)
      }
      expect(task.assignees).toHaveLength(20)
      expect(() => task.assign(uuidv7(), ACTOR_ID)).toThrow(AssigneeLimitReachedException)
    })

    it('20 assignees exactly does not throw', () => {
      const task = makeTask()
      for (let i = 0; i < 20; i++) {
        task.assign(uuidv7(), ACTOR_ID)
      }
      expect(task.assignees).toHaveLength(20)
    })
  })

  describe('unassign()', () => {
    it('removes an assignee', () => {
      const task = makeTask()
      const actorId = uuidv7()
      task.assign(actorId, ACTOR_ID)
      task.unassign(actorId)
      expect(task.assignees).toHaveLength(0)
    })

    it('is silently ignored if actor is not assigned', () => {
      const task = makeTask()
      expect(() => task.unassign(uuidv7())).not.toThrow()
      expect(task.assignees).toHaveLength(0)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // applyLabel() / removeLabel()
  // ──────────────────────────────────────────────────────────────────────────

  describe('applyLabel()', () => {
    it('adds a label slot', () => {
      const task = makeTask()
      const slot = LabelSlot.of('category1')
      task.applyLabel(slot)
      expect(task.appliedLabels).toHaveLength(1)
      expect(task.appliedLabels[0].value).toBe('category1')
    })

    it('is idempotent — applying the same slot twice does not duplicate', () => {
      const task = makeTask()
      const slot = LabelSlot.of('category1')
      task.applyLabel(slot)
      task.applyLabel(slot)
      expect(task.appliedLabels).toHaveLength(1)
    })
  })

  describe('removeLabel()', () => {
    it('removes a label slot', () => {
      const task = makeTask()
      const slot = LabelSlot.of('category2')
      task.applyLabel(slot)
      task.removeLabel(slot)
      expect(task.appliedLabels).toHaveLength(0)
    })

    it('is silently ignored if slot is not applied', () => {
      const task = makeTask()
      expect(() => task.removeLabel(LabelSlot.of('category3'))).not.toThrow()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // addChecklistItem()
  // ──────────────────────────────────────────────────────────────────────────

  function makeChecklistItem(
    overrides?: Partial<{ id: string; title: string; orderHint: string }>,
  ): ChecklistItem {
    return ChecklistItem.create({
      id: overrides?.id ?? uuidv7(),
      title: overrides?.title ?? 'Checklist item',
      orderHint: overrides?.orderHint ?? MsOrderHint.between(),
    })
  }

  describe('addChecklistItem()', () => {
    it('increments checklistItemCount', () => {
      const task = makeTask()
      task.addChecklistItem(makeChecklistItem())
      expect(task.checklistItemCount).toBe(1)
    })

    it('stores the item in checklistItems', () => {
      const task = makeTask()
      const item = makeChecklistItem({ id: 'ci-1', title: 'Step 1' })
      task.addChecklistItem(item)
      expect(task.checklistItems).toHaveLength(1)
      expect(task.checklistItems[0].id).toBe('ci-1')
    })

    it('can add up to 20 checklist items', () => {
      const task = makeTask()
      for (let i = 0; i < 20; i++) {
        task.addChecklistItem(makeChecklistItem())
      }
      expect(task.checklistItemCount).toBe(20)
    })

    it('throws ChecklistLimitReachedException on 21st item', () => {
      const task = makeTask()
      for (let i = 0; i < 20; i++) {
        task.addChecklistItem(makeChecklistItem())
      }
      expect(() => task.addChecklistItem(makeChecklistItem())).toThrow(
        ChecklistLimitReachedException,
      )
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // toggleChecklistItem()
  // ──────────────────────────────────────────────────────────────────────────

  describe('toggleChecklistItem()', () => {
    it('increments checklistCheckedCount when checking (isChecked: false → true)', () => {
      const task = makeTask()
      const item = makeChecklistItem({ id: 'ci-1' })
      task.addChecklistItem(item)
      expect(task.checklistCheckedCount).toBe(0)
      task.toggleChecklistItem('ci-1')
      expect(task.checklistCheckedCount).toBe(1)
    })

    it('decrements checklistCheckedCount when unchecking (isChecked: true → false)', () => {
      const task = makeTask()
      const item = makeChecklistItem({ id: 'ci-1' })
      task.addChecklistItem(item)
      task.toggleChecklistItem('ci-1') // check
      expect(task.checklistCheckedCount).toBe(1)
      task.toggleChecklistItem('ci-1') // uncheck
      expect(task.checklistCheckedCount).toBe(0)
    })

    it('silently no-ops if id not found', () => {
      const task = makeTask()
      expect(() => task.toggleChecklistItem('nonexistent')).not.toThrow()
      expect(task.checklistCheckedCount).toBe(0)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // updateChecklistItem()
  // ──────────────────────────────────────────────────────────────────────────

  describe('updateChecklistItem()', () => {
    it('mutates the title of the matching item', () => {
      const task = makeTask()
      const item = makeChecklistItem({ id: 'ci-1', title: 'Original' })
      task.addChecklistItem(item)
      task.updateChecklistItem('ci-1', 'Updated')
      expect(task.checklistItems[0].title).toBe('Updated')
    })

    it('throws TitleRequiredException on empty title', () => {
      const task = makeTask()
      task.addChecklistItem(makeChecklistItem({ id: 'ci-1' }))
      expect(() => task.updateChecklistItem('ci-1', '')).toThrow(TitleRequiredException)
    })

    it('throws TitleTooLongException when title exceeds 255 chars', () => {
      const task = makeTask()
      task.addChecklistItem(makeChecklistItem({ id: 'ci-1' }))
      expect(() => task.updateChecklistItem('ci-1', 'x'.repeat(256))).toThrow(TitleTooLongException)
    })

    it('silently no-ops if id not found', () => {
      const task = makeTask()
      expect(() => task.updateChecklistItem('nonexistent', 'New title')).not.toThrow()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // removeChecklistItem()
  // ──────────────────────────────────────────────────────────────────────────

  describe('removeChecklistItem()', () => {
    it('decrements checklistItemCount', () => {
      const task = makeTask()
      task.addChecklistItem(makeChecklistItem({ id: 'ci-1' }))
      expect(task.checklistItemCount).toBe(1)
      task.removeChecklistItem('ci-1')
      expect(task.checklistItemCount).toBe(0)
    })

    it('decrements checklistCheckedCount if the removed item was checked', () => {
      const task = makeTask()
      task.addChecklistItem(makeChecklistItem({ id: 'ci-1' }))
      task.toggleChecklistItem('ci-1') // mark checked
      expect(task.checklistCheckedCount).toBe(1)
      task.removeChecklistItem('ci-1')
      expect(task.checklistCheckedCount).toBe(0)
    })

    it('does not decrement checklistCheckedCount if the removed item was not checked', () => {
      const task = makeTask()
      task.addChecklistItem(makeChecklistItem({ id: 'ci-1' }))
      task.addChecklistItem(makeChecklistItem({ id: 'ci-2' }))
      task.toggleChecklistItem('ci-2') // only ci-2 is checked
      task.removeChecklistItem('ci-1') // remove unchecked item
      expect(task.checklistCheckedCount).toBe(1)
      expect(task.checklistItemCount).toBe(1)
    })

    it('silently no-ops if id not found', () => {
      const task = makeTask()
      expect(() => task.removeChecklistItem('nonexistent')).not.toThrow()
      expect(task.checklistItemCount).toBe(0)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // reorderChecklistItem()
  // ──────────────────────────────────────────────────────────────────────────

  describe('reorderChecklistItem()', () => {
    it('updates the orderHint of the matching item', () => {
      const task = makeTask()
      const hint1 = MsOrderHint.between()
      const item = makeChecklistItem({ id: 'ci-1', orderHint: hint1 })
      task.addChecklistItem(item)
      const hint2 = MsOrderHint.between(hint1, undefined)
      task.reorderChecklistItem('ci-1', hint1, undefined)
      expect(task.checklistItems[0].orderHint).toBe(MsOrderHint.between(hint1, undefined))
    })

    it('uses MsOrderHint.between(hintAfter, hintBefore) to compute new hint', () => {
      const task = makeTask()
      const hintA = MsOrderHint.between()
      const hintC = MsOrderHint.between(hintA, undefined)
      const item = makeChecklistItem({ id: 'ci-1', orderHint: hintC })
      task.addChecklistItem(item)
      task.reorderChecklistItem('ci-1', hintA, hintC)
      const expected = MsOrderHint.between(hintA, hintC)
      expect(task.checklistItems[0].orderHint).toBe(expected)
    })

    it('silently no-ops if id not found', () => {
      const task = makeTask()
      expect(() => task.reorderChecklistItem('nonexistent', undefined, undefined)).not.toThrow()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // markCompleted() / reopen()
  // ──────────────────────────────────────────────────────────────────────────

  describe('markCompleted()', () => {
    it('sets completedBy and completedAt, progress becomes 100', () => {
      const task = makeTask()
      const completedAt = new Date()
      task.markCompleted(ACTOR_ID, completedAt)
      expect(task.completedBy).toBe(ACTOR_ID)
      expect(task.completedAt).toBe(completedAt)
      expect(task.progress).toBe(100)
    })

    it('satisfies invariant: progress 100 ⟺ completedAt !== null', () => {
      const task = makeTask()
      const completedAt = new Date()
      task.markCompleted(ACTOR_ID, completedAt)
      expect(task.progress === 100).toBe(task.completedAt !== null)
    })
  })

  describe('reopen()', () => {
    it('clears completedBy and completedAt, progress becomes 0', () => {
      const task = makeTask()
      task.markCompleted(ACTOR_ID, new Date())
      task.reopen()
      expect(task.completedBy).toBeNull()
      expect(task.completedAt).toBeNull()
      expect(task.progress).toBe(0)
    })

    it('satisfies invariant after reopen: progress < 100 and completedAt is null', () => {
      const task = makeTask()
      task.markCompleted(ACTOR_ID, new Date())
      task.reopen()
      expect(task.progress).toBeLessThan(100)
      expect(task.completedAt).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // softDelete()
  // ──────────────────────────────────────────────────────────────────────────

  describe('softDelete()', () => {
    it('sets deletedAt', () => {
      const task = makeTask()
      expect(task.deletedAt).toBeNull()
      task.softDelete(ACTOR_ID)
      expect(task.deletedAt).toBeInstanceOf(Date)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Order hint lexicographic comparison
  // ──────────────────────────────────────────────────────────────────────────

  describe('order hint lexicographic ordering', () => {
    it('MsOrderHint.between produces hints that sort correctly', () => {
      const hintA = MsOrderHint.between(undefined, undefined) // ' !'
      const hintB = MsOrderHint.between(hintA, undefined)
      const hintC = MsOrderHint.between(hintB, undefined)

      const taskA = makeTask({ orderHint: hintA })
      const taskB = makeTask({ orderHint: hintB })
      const taskC = makeTask({ orderHint: hintC })

      const sorted = [taskC, taskA, taskB].sort((x, y) =>
        x.orderHint < y.orderHint ? -1 : x.orderHint > y.orderHint ? 1 : 0,
      )

      expect(sorted[0].orderHint).toBe(hintA)
      expect(sorted[1].orderHint).toBe(hintB)
      expect(sorted[2].orderHint).toBe(hintC)
    })

    it('inserting a hint between two existing hints sorts between them', () => {
      const hintA = MsOrderHint.between(undefined, undefined)
      const hintC = MsOrderHint.between(hintA, undefined)
      const hintB = MsOrderHint.between(hintA, hintC) // between A and C

      expect(hintA < hintB).toBe(true)
      expect(hintB < hintC).toBe(true)
    })
  })
})
