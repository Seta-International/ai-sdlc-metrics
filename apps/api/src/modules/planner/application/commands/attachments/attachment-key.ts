// Uses same segments as buildKey() but stops before the uuid filename segment
export function buildAttachmentKeyPrefix(tenantId: string, taskId: string): string {
  return `${tenantId}/documents/planner/${taskId}/`
}
