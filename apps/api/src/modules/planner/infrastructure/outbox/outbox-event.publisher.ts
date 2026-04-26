export type EventOrigin = 'user' | 'api' | 'ms-sync-pull' | 'ms-sync-backfill' | 'ms-sync-push'

export interface PublishEventInput<T extends Record<string, unknown>> {
  eventName: string
  payload: T & { origin?: EventOrigin }
  tenantId: string
}

export function applyDefaultOrigin<T extends Record<string, unknown>>(
  payload: T & { origin?: EventOrigin },
): T & { origin: EventOrigin } {
  return { ...payload, origin: payload.origin ?? 'user' }
}
