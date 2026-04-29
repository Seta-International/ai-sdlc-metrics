export const OUTBOX_EVENT_REPOSITORY = Symbol('IOutboxEventRepository')

export interface IOutboxEventRepository {
  insert(data: { tenantId: string; eventName: string; payload: unknown }): Promise<void>
  findLatestByJobId(jobId: string, eventName: string): Promise<{ payload: unknown } | null>
}
