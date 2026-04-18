import { LabelSlot } from '../value-objects/label-slot.vo'
import { PlanContainer } from '../value-objects/plan-container.vo'
import { DescriptionTooLongException } from '../exceptions/description-too-long.exception'
import { LastOwnerRemovalException } from '../exceptions/last-owner-removal.exception'
import { Bucket } from './bucket.entity'

export interface Label {
  readonly slot: LabelSlot
  readonly name: string
  readonly color: string
}

export interface PlanMember {
  readonly actorId: string
  readonly role: 'owner' | 'editor' | 'viewer'
  readonly addedBy: string
  readonly addedAt: Date
}

const MAX_DESCRIPTION_LENGTH = 32000

export class Plan {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    private _name: string,
    private _description: string,
    readonly container: PlanContainer,
    readonly createdBy: string,
    readonly createdAt: Date,
    private _updatedAt: Date,
    readonly deletedAt: Date | null,
    readonly msPlanId: string | null,
    readonly msPlanEtag: string | null,
    private _buckets: Bucket[],
    private _labels: Label[],
    private _members: PlanMember[],
  ) {}

  get name(): string {
    return this._name
  }

  get description(): string {
    return this._description
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  get buckets(): readonly Bucket[] {
    return this._buckets
  }

  get labels(): readonly Label[] {
    return this._labels
  }

  get members(): readonly PlanMember[] {
    return this._members
  }

  static create(props: {
    id: string
    tenantId: string
    name: string
    description?: string
    container: PlanContainer
    createdBy: string
    ownerActorId: string
  }): Plan {
    const now = new Date()
    const ownerMember: PlanMember = {
      actorId: props.ownerActorId,
      role: 'owner',
      addedBy: props.ownerActorId,
      addedAt: now,
    }
    return new Plan(
      props.id,
      props.tenantId,
      props.name,
      props.description ?? '',
      props.container,
      props.createdBy,
      now,
      now,
      null,
      null,
      null,
      [],
      [],
      [ownerMember],
    )
  }

  renameTo(name: string): void {
    this._name = name
    this._updatedAt = new Date()
  }

  setDescription(description: string): void {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new DescriptionTooLongException(MAX_DESCRIPTION_LENGTH)
    }
    this._description = description
    this._updatedAt = new Date()
  }

  setLabel(slot: LabelSlot, name: string, color: string): void {
    const existingIndex = this._labels.findIndex((l) => l.slot.value === slot.value)
    if (existingIndex !== -1) {
      // Update in place
      this._labels[existingIndex] = { slot, name, color }
    } else {
      this._labels.push({ slot, name, color })
    }
    this._updatedAt = new Date()
  }

  removeLabel(slot: LabelSlot): void {
    this._labels = this._labels.filter((l) => l.slot.value !== slot.value)
    this._updatedAt = new Date()
  }

  addMember(actorId: string, role: 'owner' | 'editor' | 'viewer', addedBy: string): void {
    const member: PlanMember = {
      actorId,
      role,
      addedBy,
      addedAt: new Date(),
    }
    this._members.push(member)
    this._updatedAt = new Date()
  }

  removeMember(actorId: string): void {
    const remaining = this._members.filter((m) => m.actorId !== actorId)
    const hasOwner = remaining.some((m) => m.role === 'owner')
    if (!hasOwner) {
      throw new LastOwnerRemovalException(this.id)
    }
    this._members = remaining
    this._updatedAt = new Date()
  }

  addBucket(id: string, name: string, orderHint: string): void {
    const bucket = Bucket.create({
      id,
      tenantId: this.tenantId,
      planId: this.id,
      name,
      orderHint,
    })
    this._buckets.push(bucket)
    this._updatedAt = new Date()
  }

  reorderBucket(bucketId: string, newOrderHint: string): void {
    const bucket = this._buckets.find((b) => b.id === bucketId)
    if (bucket) {
      bucket.reorder(newOrderHint)
      this._updatedAt = new Date()
    }
  }
}
