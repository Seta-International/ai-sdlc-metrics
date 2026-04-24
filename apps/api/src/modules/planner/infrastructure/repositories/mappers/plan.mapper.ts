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
  containerRef: string | null
  // Legacy columns kept during Plan 4.2 transition — not used for mapping
  msGroupId: string | null
  msRosterId: string | null
  msPlanId: string | null
  msPlanEtag: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  ownerActorId: string | null
  syncEnabled: boolean
}

export function planRowToEntity(
  row: PlanRow,
  buckets: Bucket[],
  labels: Label[],
  members: PlanMember[],
): Plan {
  const container = PlanContainer.of(
    row.containerType === 'ms_group'
      ? { type: 'ms_group', externalId: row.containerRef! }
      : row.containerType === 'ms_roster'
        ? { type: 'ms_roster', externalId: row.containerRef! }
        : { type: 'future_only' },
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
    ownerActorId: row.ownerActorId,
    syncEnabled: row.syncEnabled,
  })
}

export function planEntityToRow(plan: Plan): {
  id: string
  tenantId: string
  name: string
  description: string
  containerType: string | null
  containerRef: string | null
  // Legacy columns kept during Plan 4.2 transition — written as null
  msGroupId: null
  msRosterId: null
  msPlanId: string | null
  msPlanEtag: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  ownerActorId: string | null
  syncEnabled: boolean
} {
  const containerType = plan.container.type === 'future_only' ? null : plan.container.type
  const containerRef =
    plan.container.type === 'ms_group' || plan.container.type === 'ms_roster'
      ? (plan.container as { type: string; externalId: string }).externalId
      : null

  return {
    id: plan.id,
    tenantId: plan.tenantId,
    name: plan.name,
    description: plan.description,
    containerType,
    containerRef,
    msGroupId: null,
    msRosterId: null,
    msPlanId: plan.msPlanId,
    msPlanEtag: plan.msPlanEtag,
    createdBy: plan.createdBy,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    deletedAt: plan.deletedAt,
    ownerActorId: plan.ownerActorId,
    syncEnabled: plan.syncEnabled,
  }
}
