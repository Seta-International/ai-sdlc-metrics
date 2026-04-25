import type { TurnResult } from './shadow-diff-scorer'

export const SHADOW_TURN_JOB_NAME = 'agent.shadow-turn'

export interface ShadowTurnJob {
  baselineTraceId: string
  baselineOutput: TurnResult
  candidateVersion: string
  baselineVersion: string
  rolloutConfigId: string
  tenantId: string
  userId?: string
}
