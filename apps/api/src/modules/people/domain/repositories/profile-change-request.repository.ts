import type {
  ChangeRequestStatus,
  ProfileChangeRequest,
} from '../entities/profile-change-request.entity'

export const PROFILE_CHANGE_REQUEST_REPOSITORY = Symbol('IProfileChangeRequestRepository')

export interface IProfileChangeRequestRepository {
  findById(id: string, tenantId: string): Promise<ProfileChangeRequest | null>
  findByBatchId(batchId: string, tenantId: string): Promise<ProfileChangeRequest[]>
  findByEmploymentId(
    employmentId: string,
    tenantId: string,
    status?: ChangeRequestStatus,
  ): Promise<ProfileChangeRequest[]>
  findByTenant(
    tenantId: string,
    status?: ChangeRequestStatus,
    limit?: number,
    offset?: number,
  ): Promise<ProfileChangeRequest[]>
  findPendingByFieldPath(
    employmentId: string,
    fieldPath: string,
    tenantId: string,
  ): Promise<ProfileChangeRequest | null>
  findScheduledBeforeDate(tenantId: string, beforeDate: Date): Promise<ProfileChangeRequest[]>
  insertMany(
    data: Omit<ProfileChangeRequest, 'id' | 'createdAt'>[],
  ): Promise<ProfileChangeRequest[]>
  updateStatus(
    id: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy?: string,
    reviewNote?: string,
  ): Promise<void>
  updateStatusByBatchId(
    batchId: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<void>
}
