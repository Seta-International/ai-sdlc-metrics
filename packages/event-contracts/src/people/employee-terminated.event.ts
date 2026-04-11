export interface EmployeeTerminatedEvent {
  actorId: string
  tenantId: string
  terminationDate: string // ISO date string
}
