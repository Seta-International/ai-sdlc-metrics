export class LabelLimitReachedException extends Error {
  constructor(planId: string, max = 25) {
    super(`Label limit (${max}) reached for plan: ${planId}`)
    this.name = 'LabelLimitReachedException'
  }
}
