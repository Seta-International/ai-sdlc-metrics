import type { Plan } from '../entities/plan.entity'

export const PLAN_REPOSITORY = Symbol('IPlanRepository')

export interface MsPlanUpsertProps {
  tenantId: string
  msPlanId: string
  msPlanEtag: string
  title: string
  containerType: 'ms_group' | 'ms_roster'
  containerRef: string
}

export interface IPlanRepository {
  findById(id: string, tenantId: string): Promise<Plan | null>
  findByTenantId(tenantId: string): Promise<Plan[]>
  findPersonalByOwner(tenantId: string, ownerActorId: string): Promise<{ id: string } | null>
  listAllIds(tenantId: string): Promise<string[]>
  save(plan: Plan): Promise<void>
  softDelete(id: string, tenantId: string): Promise<void>
  upsertFromMs(props: MsPlanUpsertProps, opts: { origin: string }): Promise<{ id: string }>
}
