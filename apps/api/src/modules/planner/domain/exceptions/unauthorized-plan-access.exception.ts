export class UnauthorizedPlanAccessException extends Error {
  constructor(actorId: string, planId: string) {
    super(`Actor ${actorId} is not authorized to access plan: ${planId}`)
    this.name = 'UnauthorizedPlanAccessException'
  }
}
