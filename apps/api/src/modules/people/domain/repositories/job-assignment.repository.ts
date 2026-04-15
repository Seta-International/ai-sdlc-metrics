import type { JobAssignment } from '../entities/job-assignment.entity'

export const JOB_ASSIGNMENT_REPOSITORY = Symbol('IJobAssignmentRepository')

export interface IJobAssignmentRepository {
  findById(id: string, tenantId: string): Promise<JobAssignment | null>
  findCurrent(employmentId: string, tenantId: string): Promise<JobAssignment | null>
  findAsOf(employmentId: string, tenantId: string, asOfDate: Date): Promise<JobAssignment | null>
  findHistory(employmentId: string, tenantId: string): Promise<JobAssignment[]>
  insert(data: Omit<JobAssignment, 'id' | 'createdAt'>): Promise<JobAssignment>
  closeAssignment(id: string, tenantId: string, effectiveTo: Date): Promise<void>
  delete(id: string, tenantId: string): Promise<void>
}
