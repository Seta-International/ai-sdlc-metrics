import { EmploymentProfile, EmploymentStatus } from '../entities/employment-profile.entity'

export const EMPLOYMENT_PROFILE_REPOSITORY = Symbol('IEmploymentProfileRepository')

export interface IEmploymentProfileRepository {
  findById(id: string, tenantId: string): Promise<EmploymentProfile | null>
  findByActorId(actorId: string, tenantId: string): Promise<EmploymentProfile | null>
  findByEmployeeCode(employeeCode: string, tenantId: string): Promise<EmploymentProfile | null>
  insert(
    data: Omit<EmploymentProfile, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<EmploymentProfile>
  updateStatus(
    id: string,
    tenantId: string,
    status: EmploymentStatus,
    terminationDate?: Date,
  ): Promise<void>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<EmploymentProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>>,
  ): Promise<EmploymentProfile>
  listByTenant(
    tenantId: string,
    filters?: { status?: EmploymentStatus; limit?: number; offset?: number },
  ): Promise<EmploymentProfile[]>
}
