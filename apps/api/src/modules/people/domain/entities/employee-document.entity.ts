export type DocumentCategory =
  | 'identity'
  | 'contract'
  | 'tax'
  | 'insurance'
  | 'certificate'
  | 'visa'
  | 'policy_ack'
  | 'health_check'
  | 'background_check'
  | 'other'

export type DocumentStatus = 'active' | 'archived' | 'pending_deletion'

export interface EmployeeDocument {
  id: string
  tenantId: string
  employmentId: string
  documentId: string
  category: DocumentCategory
  subcategory: string | null
  title: string
  expiryDate: Date | null
  isConfidential: boolean
  requiresAcknowledgment: boolean
  acknowledgedAt: Date | null
  acknowledgedBy: string | null
  version: number
  parentDocumentId: string | null
  status: DocumentStatus
  uploadedBy: string
  createdAt: Date
}
