export abstract class MsPlannerClientPort {
  syncPlan(_planId: string): Promise<void> {
    throw new Error('MS Planner sync not enabled in Phase 1')
  }
}
