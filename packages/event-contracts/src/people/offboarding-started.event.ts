export interface OffboardingStartedEvent {
  actorId: string
  tenantId: string
  expectedLastDay: string // ISO date string
}
