import type {
  Allocation,
  BillingType,
  MemberType,
  AllocationStatus,
} from '../entities/allocation.entity'

export const ALLOCATION_REPOSITORY = Symbol('IAllocationRepository')

export interface IAllocationRepository {
  findById(id: string, tenantId: string): Promise<Allocation | null>
  findByActorId(actorId: string, tenantId: string): Promise<Allocation[]>
  findActiveByActorId(actorId: string, tenantId: string): Promise<Allocation[]>
  findConfirmedByActorId(actorId: string, tenantId: string): Promise<Allocation[]>
  findByProjectRoleId(projectRoleId: string, tenantId: string): Promise<Allocation[]>
  findByAccountId(accountId: string, tenantId: string): Promise<Allocation[]>
  insert(data: {
    tenantId: string
    projectId: string
    projectRoleId: string
    actorId: string | null
    position: string | null
    hoursPerDay: string
    billingType: BillingType
    memberType: MemberType
    startedAt: Date
    endedAt: Date | null
    note: string | null
  }): Promise<Allocation>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        Allocation,
        'position' | 'hoursPerDay' | 'billingType' | 'memberType' | 'startedAt' | 'endedAt' | 'note'
      >
    >,
  ): Promise<void>
  updateStatus(id: string, tenantId: string, status: AllocationStatus): Promise<void>
  close(id: string, tenantId: string, endedAt: Date): Promise<void>
  closeAllForActor(actorId: string, tenantId: string, endedAt: Date): Promise<void>
  flagTentativeForActor(actorId: string, tenantId: string, expectedLastDay: Date): Promise<void>
  sumConfirmedHoursPerDay(
    actorId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number>
}
