export const SPRINT_REPOSITORY = Symbol('ISprintRepository')

export interface SprintRecord {
  id: string
  tenantId: string
  planId: string
  name: string
  startDate: string // ISO date YYYY-MM-DD
  endDate: string // ISO date YYYY-MM-DD
  completedAt: Date | null
}

export interface ISprintRepository {
  save(record: SprintRecord): Promise<void>
  findById(id: string, tenantId: string): Promise<SprintRecord | null>
  listByPlan(planId: string, tenantId: string): Promise<SprintRecord[]>
  complete(id: string, tenantId: string, completedAt: Date): Promise<void>
}
