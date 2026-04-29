export const JOB_SCHEDULER = Symbol('IJobScheduler')

export interface IJobScheduler {
  enqueueDirectorySync(tenantId: string, identityProviderId: string): Promise<string>
  getNextScheduledSync(tenantId: string): Promise<Date | null>
}
