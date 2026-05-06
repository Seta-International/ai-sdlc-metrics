export class CustomFieldLimitExceededException extends Error {
  constructor(planId: string) {
    super(`Plan ${planId} already has the maximum 10 custom field definitions`)
    this.name = 'CustomFieldLimitExceededException'
  }
}
