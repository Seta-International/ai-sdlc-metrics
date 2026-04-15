import type { DocumentCategory } from '../../domain/entities/employee-document.entity'

export class UploadEmployeeDocumentCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly documentId: string,
    readonly category: DocumentCategory,
    readonly title: string,
    readonly uploadedBy: string,
    readonly subcategory?: string | null,
    readonly expiryDate?: Date | null,
    readonly isConfidential?: boolean,
    readonly requiresAcknowledgment?: boolean,
    readonly parentDocumentId?: string | null,
  ) {}
}
