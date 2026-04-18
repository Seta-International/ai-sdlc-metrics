import { describe, expect, it } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { Plan } from './plan.entity'
import { PlanContainer } from '../value-objects/plan-container.vo'
import { LabelSlot } from '../value-objects/label-slot.vo'
import { MsOrderHint } from '../value-objects/ms-order-hint.vo'
import { DescriptionTooLongException } from '../exceptions/description-too-long.exception'
import { LastOwnerRemovalException } from '../exceptions/last-owner-removal.exception'

const makePlan = () => {
  const ownerActorId = uuidv7()
  const plan = Plan.create({
    id: uuidv7(),
    tenantId: uuidv7(),
    name: 'Sprint 1',
    container: PlanContainer.of({ type: 'none' }),
    createdBy: ownerActorId,
    ownerActorId,
  })
  return { plan, ownerActorId }
}

describe('Plan aggregate', () => {
  describe('Plan.create()', () => {
    it('produces a plan with 1 owner member', () => {
      const ownerActorId = uuidv7()
      const plan = Plan.create({
        id: uuidv7(),
        tenantId: uuidv7(),
        name: 'My Plan',
        container: PlanContainer.of({ type: 'none' }),
        createdBy: ownerActorId,
        ownerActorId,
      })

      expect(plan.members).toHaveLength(1)
      expect(plan.members[0].actorId).toBe(ownerActorId)
      expect(plan.members[0].role).toBe('owner')
      expect(plan.members[0].addedBy).toBe(ownerActorId)
      expect(plan.members[0].addedAt).toBeInstanceOf(Date)
    })
  })

  describe('renameTo()', () => {
    it('updates the name', () => {
      const { plan } = makePlan()
      plan.renameTo('Sprint 2')
      expect(plan.name).toBe('Sprint 2')
    })
  })

  describe('setDescription()', () => {
    it('throws DescriptionTooLongException when description exceeds 32000 chars', () => {
      const { plan } = makePlan()
      const longDescription = 'x'.repeat(32001)
      expect(() => plan.setDescription(longDescription)).toThrow(DescriptionTooLongException)
    })

    it('allows description up to 32000 chars', () => {
      const { plan } = makePlan()
      const maxDescription = 'x'.repeat(32000)
      expect(() => plan.setDescription(maxDescription)).not.toThrow()
      expect(plan.description).toBe(maxDescription)
    })
  })

  describe('setLabel()', () => {
    it('adds a new label to the labels array', () => {
      const { plan } = makePlan()
      const slot = LabelSlot.of('category1')
      plan.setLabel(slot, 'Bug', '#ff0000')
      expect(plan.labels).toHaveLength(1)
      expect(plan.labels[0].slot).toBe(slot)
      expect(plan.labels[0].name).toBe('Bug')
      expect(plan.labels[0].color).toBe('#ff0000')
    })

    it('updates an existing label at the same slot without changing count', () => {
      const { plan } = makePlan()
      const slot = LabelSlot.of('category1')
      plan.setLabel(slot, 'Bug', '#ff0000')
      plan.setLabel(slot, 'Feature', '#00ff00')
      expect(plan.labels).toHaveLength(1)
      expect(plan.labels[0].name).toBe('Feature')
      expect(plan.labels[0].color).toBe('#00ff00')
    })

    it('does NOT throw when updating an existing slot at full capacity (25 labels)', () => {
      const { plan } = makePlan()
      // Fill all 25 slots
      for (let i = 1; i <= 25; i++) {
        plan.setLabel(LabelSlot.of(`category${i}`), `Label ${i}`, '#aabbcc')
      }
      expect(plan.labels).toHaveLength(25)
      // Updating an existing slot at full capacity must not throw
      expect(() =>
        plan.setLabel(LabelSlot.of('category1'), 'Updated Label', '#ffffff'),
      ).not.toThrow()
      expect(plan.labels).toHaveLength(25)
    })
  })

  describe('removeLabel()', () => {
    it('removes the label at the given slot', () => {
      const { plan } = makePlan()
      const slot = LabelSlot.of('category3')
      plan.setLabel(slot, 'QA', '#0000ff')
      expect(plan.labels).toHaveLength(1)
      plan.removeLabel(slot)
      expect(plan.labels).toHaveLength(0)
    })
  })

  describe('addMember()', () => {
    it('adds a member with the given role', () => {
      const { plan, ownerActorId } = makePlan()
      const newMemberId = uuidv7()
      plan.addMember(newMemberId, 'editor', ownerActorId)
      expect(plan.members).toHaveLength(2)
      const added = plan.members.find((m) => m.actorId === newMemberId)
      expect(added).toBeDefined()
      expect(added?.role).toBe('editor')
      expect(added?.addedBy).toBe(ownerActorId)
    })
  })

  describe('removeMember()', () => {
    it('removes a non-owner member', () => {
      const { plan, ownerActorId } = makePlan()
      const editorId = uuidv7()
      plan.addMember(editorId, 'editor', ownerActorId)
      expect(plan.members).toHaveLength(2)
      plan.removeMember(editorId)
      expect(plan.members).toHaveLength(1)
      expect(plan.members[0].actorId).toBe(ownerActorId)
    })

    it('throws LastOwnerRemovalException when removing the last owner', () => {
      const { plan, ownerActorId } = makePlan()
      expect(() => plan.removeMember(ownerActorId)).toThrow(LastOwnerRemovalException)
    })
  })

  describe('addBucket()', () => {
    it('appends a bucket to the buckets array', () => {
      const { plan } = makePlan()
      const bucketId = uuidv7()
      plan.addBucket(bucketId, 'Todo', ' !')
      expect(plan.buckets).toHaveLength(1)
      expect(plan.buckets[0].id).toBe(bucketId)
      expect(plan.buckets[0].name).toBe('Todo')
      expect(plan.buckets[0].orderHint).toBe(' !')
    })
  })

  describe('reorderBucket()', () => {
    it('updates the bucket orderHint and buckets sort lexicographically in expected order', () => {
      const { plan } = makePlan()

      const idA = uuidv7()
      const idB = uuidv7()
      const idC = uuidv7()

      // Create 3 buckets in order A < B < C
      const hintA = MsOrderHint.between(undefined, undefined) // ' !'
      const hintB = MsOrderHint.between(hintA, undefined) // ' ! !'
      const hintC = MsOrderHint.between(hintB, undefined) // ' ! ! !'

      plan.addBucket(idA, 'Bucket A', hintA)
      plan.addBucket(idB, 'Bucket B', hintB)
      plan.addBucket(idC, 'Bucket C', hintC)

      // Move C to be between A and B
      const newHintForC = MsOrderHint.between(hintA, hintB)
      plan.reorderBucket(idC, newHintForC)

      // After reorder, sorted by orderHint: A < newC < B
      const sorted = [...plan.buckets].sort((x, y) =>
        x.orderHint < y.orderHint ? -1 : x.orderHint > y.orderHint ? 1 : 0,
      )
      expect(sorted[0].id).toBe(idA)
      expect(sorted[1].id).toBe(idC)
      expect(sorted[2].id).toBe(idB)
    })
  })
})
