import type { PlanMember } from '../../../domain/entities/plan.entity'

export interface PlanMemberRow {
  planId: string
  actorId: string
  role: string
  addedBy: string
  addedAt: Date
  tenantId: string
}

export function planMemberRowToEntity(row: PlanMemberRow): PlanMember {
  return {
    actorId: row.actorId,
    role: row.role as PlanMember['role'],
    addedBy: row.addedBy,
    addedAt: row.addedAt,
  }
}

export function planMemberEntityToRow(
  planId: string,
  tenantId: string,
  member: PlanMember,
): PlanMemberRow {
  return {
    planId,
    actorId: member.actorId,
    role: member.role,
    addedBy: member.addedBy,
    addedAt: member.addedAt,
    tenantId,
  }
}
