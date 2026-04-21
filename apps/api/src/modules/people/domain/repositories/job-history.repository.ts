import type { JobHistoryEntry } from '../entities/job-history-entry.entity'

export const JOB_HISTORY_REPOSITORY = Symbol('IJobHistoryRepository')

export interface IJobHistoryRepository {
  findByProfile(profileId: string, tenantId: string): Promise<JobHistoryEntry[]>

  findAsOf(profileId: string, tenantId: string, asOf: Date): Promise<JobHistoryEntry | null>

  findLatest(profileId: string, tenantId: string): Promise<JobHistoryEntry | null>

  recordChange(
    entry: Omit<JobHistoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'recordedAt'>,
  ): Promise<JobHistoryEntry>

  closeOpenEntry(profileId: string, tenantId: string, effectiveTo: Date): Promise<void>
}
