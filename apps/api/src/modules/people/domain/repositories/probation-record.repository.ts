import type { ProbationRecord } from '../entities/probation-record.entity'

export const PROBATION_RECORD_REPOSITORY = Symbol('IProbationRecordRepository')

export interface IProbationRecordRepository {
  findByEmploymentId(employmentId: string, tenantId: string): Promise<ProbationRecord | null>
  findActiveByTenant(tenantId: string): Promise<ProbationRecord[]>
  insert(data: Omit<ProbationRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProbationRecord>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ProbationRecord, 'id' | 'tenantId' | 'employmentId' | 'createdAt'>>,
  ): Promise<ProbationRecord>
}
