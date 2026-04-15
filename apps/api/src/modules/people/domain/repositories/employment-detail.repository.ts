import type { EmploymentDetail } from '../entities/employment-detail.entity'

export const EMPLOYMENT_DETAIL_REPOSITORY = Symbol('IEmploymentDetailRepository')

export interface IEmploymentDetailRepository {
  findByEmploymentId(employmentId: string, tenantId: string): Promise<EmploymentDetail | null>
  insert(data: Omit<EmploymentDetail, 'id'>): Promise<EmploymentDetail>
  update(
    employmentId: string,
    tenantId: string,
    data: Partial<Omit<EmploymentDetail, 'id' | 'tenantId' | 'employmentId'>>,
  ): Promise<EmploymentDetail>
}
