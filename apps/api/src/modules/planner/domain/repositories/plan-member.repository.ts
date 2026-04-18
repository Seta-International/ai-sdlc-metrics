import type { PlanMember } from '../entities/plan.entity'

export const PLAN_MEMBER_REPOSITORY = Symbol('IPlanMemberRepository')

export interface IPlanMemberRepository {
  findByPlanId(planId: string, tenantId: string): Promise<PlanMember[]>
  upsert(planId: string, tenantId: string, member: PlanMember): Promise<void>
  delete(planId: string, actorId: string, tenantId: string): Promise<void>
}
