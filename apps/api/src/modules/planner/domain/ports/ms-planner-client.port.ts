export const MS_PLANNER_CLIENT = Symbol('MsPlannerClientPort')

export interface MsPlannerClientPort {
  syncPlan(planId: string): Promise<void>
}
