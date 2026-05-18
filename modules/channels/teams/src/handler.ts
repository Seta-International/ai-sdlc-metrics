import type { Activity } from './activity'

export interface OutboundActivity {
  type: string
  text?: string
  attachments?: unknown[]
  value?: unknown
}

export interface RunContext {
  userId: string
  abortSignal?: AbortSignal
}

export type TeamsHandler = (
  activity: Activity,
  runCtx: RunContext,
) => Promise<OutboundActivity | null>
