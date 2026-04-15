export type ImportJobStatus =
  | 'uploaded'
  | 'mapped'
  | 'validated'
  | 'previewed'
  | 'committed'
  | 'partially_committed'
  | 'failed'

export interface ImportJob {
  id: string
  tenantId: string
  fileDocumentId: string
  fileName: string
  rowCount: number
  columnMapping: Record<string, string> | null
  mappingProfile: string | null
  status: ImportJobStatus
  validCount: number | null
  errorCount: number | null
  warningCount: number | null
  validationReport: Record<string, unknown> | null
  createdCount: number | null
  updatedCount: number | null
  skippedCount: number | null
  errorDetails: Record<string, unknown> | null
  requestedBy: string
  createdAt: Date
  completedAt: Date | null
}
