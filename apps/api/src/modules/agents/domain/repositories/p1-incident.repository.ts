/**
 * p1-incident.repository.ts — Plan 13 Task 2
 *
 * Domain repository interface for P1/P2 production incidents tracked by the
 * GA readiness harness.
 */

export type IncidentSeverity = 'P1' | 'P2'
export type IncidentCategory = 'security' | 'reliability' | 'cost' | 'observability'

export interface P1IncidentEntity {
  id: string
  tenantId: string
  openedAt: Date
  closedAt: Date | null
  severity: IncidentSeverity
  category: IncidentCategory
  summary: string
  postMortemUrl: string | null
}

export interface P1IncidentRepository {
  insert(incident: Omit<P1IncidentEntity, 'id'>): Promise<P1IncidentEntity>
  /** Counts ALL P1 security incidents opened in the last 90 days (open AND closed) — the GA gate requires zero incidents regardless of resolution status. */
  countOpenSecurityLast90Days(): Promise<number>
  close(opts: { id: string; closedAt: Date; postMortemUrl?: string }): Promise<void>
  findRecent(opts: { limit?: number; severity?: IncidentSeverity }): Promise<P1IncidentEntity[]>
}

export const P1_INCIDENT_REPOSITORY = Symbol('P1_INCIDENT_REPOSITORY')
