import PQueue from 'p-queue'

const queues = new Map<string, PQueue>()
let perTenantConcurrency = 4

export function setPerTenantConcurrency(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${n}`)
  }
  perTenantConcurrency = n
}

export function getQueue(tenantId: string): PQueue {
  let q = queues.get(tenantId)
  if (!q) {
    q = new PQueue({ concurrency: perTenantConcurrency })
    queues.set(tenantId, q)
  }
  return q
}

export async function enqueueRun(tenantId: string, fn: () => Promise<void>): Promise<void> {
  await getQueue(tenantId).add(fn)
}

export function getQueueSize(tenantId: string): number {
  return queues.get(tenantId)?.size ?? 0
}

export function __resetQueueRegistryForTests(): void {
  for (const q of queues.values()) q.clear()
  queues.clear()
  perTenantConcurrency = 4
}
