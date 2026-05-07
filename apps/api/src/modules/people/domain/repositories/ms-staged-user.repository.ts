import type { MsStagedUser, MsStagedUserStatus } from '../entities/ms-staged-user.entity'

export const MS_STAGED_USER_REPOSITORY = 'MS_STAGED_USER_REPOSITORY'

export interface IMsStagedUserRepository {
  findById(id: string, tenantId: string): Promise<MsStagedUser | null>
  findByMsExternalId(msExternalId: string, tenantId: string): Promise<MsStagedUser | null>
  findLatestImportedByEmail(email: string, tenantId: string): Promise<MsStagedUser | null>
  upsertFromSync(
    tenantId: string,
    data: {
      msExternalId: string
      displayName: string
      email: string | null
      jobTitle: string | null
      department: string | null
      officeLocation: string | null
      mobilePhone: string | null
      workPhone: string | null
      managerMsId: string | null
      photoDocumentId: string | null
    },
  ): Promise<MsStagedUser>
  updateStatus(
    id: string,
    tenantId: string,
    status: MsStagedUserStatus,
    importedEmploymentId?: string,
  ): Promise<void>
  listByStatus(
    tenantId: string,
    status: MsStagedUserStatus,
    limit: number,
    offset: number,
  ): Promise<MsStagedUser[]>
  countByStatus(tenantId: string, status: MsStagedUserStatus): Promise<number>
  findByImportedEmploymentId(employmentId: string, tenantId: string): Promise<MsStagedUser | null>
}
