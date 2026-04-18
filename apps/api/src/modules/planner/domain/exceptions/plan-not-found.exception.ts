export class PlanNotFoundException extends Error {
  constructor(planId: string) {
    super(`Plan not found: ${planId}`)
    this.name = 'PlanNotFoundException'
  }
}
