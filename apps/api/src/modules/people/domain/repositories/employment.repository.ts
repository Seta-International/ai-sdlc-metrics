import type { Employment } from '../entities/employment.entity'
import type { EmploymentStatus } from '../value-objects/employment-status'

export const EMPLOYMENT_REPOSITORY = Symbol('IEmploymentRepository')

export interface IEmploymentRepository {
  findById(id: string, tenantId: string): Promise<Employment | null>
  findByPersonProfileId(personProfileId: string, tenantId: string): Promise<Employment[]>
  findActiveByActorId(actorId: string, tenantId: string): Promise<Employment | null>
  insert(data: Omit<Employment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employment>
  updateStatus(
    id: string,
    tenantId: string,
    status: EmploymentStatus,
    terminationDate?: Date | null,
    terminationReason?: string | null,
  ): Promise<void>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<Employment, 'id' | 'tenantId' | 'personProfileId' | 'createdAt'>>,
  ): Promise<Employment>
  listByTenant(
    tenantId: string,
    filters?: { status?: EmploymentStatus; countryCode?: string; limit?: number; offset?: number },
  ): Promise<Employment[]>
  countByTenant(
    tenantId: string,
    filters?: { status?: EmploymentStatus; countryCode?: string },
  ): Promise<number>
}
