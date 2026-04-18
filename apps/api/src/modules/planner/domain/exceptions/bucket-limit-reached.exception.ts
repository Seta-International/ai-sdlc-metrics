export class BucketLimitReachedException extends Error {
  constructor(planId: string) {
    super(`Bucket limit reached for plan: ${planId}`)
    this.name = 'BucketLimitReachedException'
  }
}
