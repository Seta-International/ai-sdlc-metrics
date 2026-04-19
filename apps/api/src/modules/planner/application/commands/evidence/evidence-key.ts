export function buildEvidenceKeyPrefix(tenantId: string, taskId: string): string {
  return `${tenantId}/documents/planner-evidence/${taskId}/`
}
