export type Schedule = {
  readonly id: string
  readonly tenantId: string
  readonly kind: 'personal' | 'tenant_wide'
  readonly ownerUserId: string | null
  readonly createdBy: string
  readonly triggerKind: 'cron' | 'event'
  readonly cronExpression: string | null
  readonly eventSubscription: { eventType: string; filter: unknown } | null
  readonly prompt: string
  readonly delegationId: string
  readonly costCeilingDailyUsd: string // numeric comes back as string from Drizzle
  readonly invocationCeilingDaily: number
  readonly status: 'active' | 'paused' | 'deleted'
  readonly pauseReason: string | null
  readonly consecutiveFailureCount: number
  readonly failureAlertPolicy: 'owner' | 'owner_and_admin' | 'admin_only' | 'silent'
  readonly createdAt: Date
  readonly updatedAt: Date
}
