export function buildPlan(overrides: Record<string, unknown> = {}) {
  return { id: 'plan-1', tenantId: 'tenant-1', name: 'Test Plan', ...overrides }
}
