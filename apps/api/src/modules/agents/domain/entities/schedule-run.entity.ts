export type ScheduleRun = {
  readonly id: string
  readonly scheduleId: string
  readonly tenantId: string
  readonly traceId: string
  readonly flowId: string
  readonly pgBossJobId: string | null
  readonly startedAt: Date
  readonly endedAt: Date | null
  readonly outcome:
    | 'completed'
    | 'refused'
    | 'budget'
    | 'error'
    | 'cancelled_per_run'
    | 'cancelled_schedule_paused'
    | null
  readonly taintSeeded: boolean
  readonly pinnedVersions: {
    router_version: string
    sub_agent_version: string
    tool_meta_version: string
    model_id: string
  }
  readonly costSpentUsd: string // numeric comes back as string from Drizzle
  readonly firedBy: string // 'cron' | `event:${string}`
}
