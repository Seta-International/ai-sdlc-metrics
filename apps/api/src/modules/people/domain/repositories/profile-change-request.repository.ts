import { ProfileChangeRequest } from '../entities/profile-change-request.entity'

export const PROFILE_CHANGE_REQUEST_REPOSITORY = Symbol('IProfileChangeRequestRepository')

export interface IProfileChangeRequestRepository {
  findById(id: string, tenantId: string): Promise<ProfileChangeRequest | null>
  findPendingByProfileAndField(
    profileId: string,
    fieldPath: string,
    tenantId: string,
  ): Promise<ProfileChangeRequest | null>
  insert(data: Omit<ProfileChangeRequest, 'id' | 'createdAt'>): Promise<ProfileChangeRequest>
  updateStatus(
    id: string,
    tenantId: string,
    status: ProfileChangeRequest['status'],
    reviewedBy?: string,
  ): Promise<void>
  listByProfile(profileId: string, tenantId: string): Promise<ProfileChangeRequest[]>
}
