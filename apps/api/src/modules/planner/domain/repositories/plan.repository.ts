import type { Plan } from '../entities/plan.entity'

export const PLAN_REPOSITORY = Symbol('IPlanRepository')

export interface IPlanRepository {
  findById(id: string, tenantId: string): Promise<Plan | null>
  findByTenantId(tenantId: string): Promise<Plan[]>
  listAllIds(tenantId: string): Promise<string[]>
  save(plan: Plan): Promise<void>
  softDelete(id: string, tenantId: string): Promise<void>
}
