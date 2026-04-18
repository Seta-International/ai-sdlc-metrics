import { Plan } from '../../../domain/entities/plan.entity'
import { Bucket } from '../../../domain/entities/bucket.entity'
import type { Label, PlanMember } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'

export interface PlanRow {
  id: string
  tenantId: string
  name: string
  description: string
  containerType: string | null
  msGroupId: string | null
  msRosterId: string | null
  msPlanId: string | null
  msPlanEtag: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export function planRowToEntity(
  row: PlanRow,
  buckets: Bucket[],
  labels: Label[],
  members: PlanMember[],
): Plan {
  const container = PlanContainer.of(
    row.containerType === 'group'
      ? { type: 'group', externalId: row.msGroupId! }
      : row.containerType === 'roster'
        ? { type: 'roster', externalId: row.msRosterId! }
        : { type: 'none' },
  )

  return Plan.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    container,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    msPlanId: row.msPlanId,
    msPlanEtag: row.msPlanEtag,
    buckets,
    labels,
    members,
  })
}

export function planEntityToRow(plan: Plan): {
  id: string
  tenantId: string
  name: string
  description: string
  containerType: string | null
  msGroupId: string | null
  msRosterId: string | null
  msPlanId: string | null
  msPlanEtag: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
} {
  const containerType = plan.container.type === 'none' ? null : plan.container.type
  const msGroupId =
    plan.container.type === 'group'
      ? (plan.container as { type: 'group'; externalId: string }).externalId
      : null
  const msRosterId =
    plan.container.type === 'roster'
      ? (plan.container as { type: 'roster'; externalId: string }).externalId
      : null

  return {
    id: plan.id,
    tenantId: plan.tenantId,
    name: plan.name,
    description: plan.description,
    containerType,
    msGroupId,
    msRosterId,
    msPlanId: plan.msPlanId,
    msPlanEtag: plan.msPlanEtag,
    createdBy: plan.createdBy,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    deletedAt: plan.deletedAt,
  }
}
