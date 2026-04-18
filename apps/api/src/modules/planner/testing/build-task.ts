export function buildTask(overrides: Record<string, unknown> = {}) {
  return { id: 'task-1', tenantId: 'tenant-1', title: 'Test Task', ...overrides }
}
