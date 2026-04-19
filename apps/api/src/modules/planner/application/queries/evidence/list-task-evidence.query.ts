export class ListTaskEvidenceQuery {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
  ) {}
}

export interface TaskEvidenceDto {
  id: string
  taskId: string
  tenantId: string
  submittedBy: string
  submittedAt: Date
  kind: 'file' | 'link' | 'note'
  caption: string
  storageKey: string | undefined
  filename: string | undefined
  contentType: string | undefined
  sizeBytes: number | undefined
  url: string | undefined
  linkTitle: string | undefined
  body: string | undefined
  verifiedBy: string | null
  verifiedAt: Date | null
  verificationNote: string | null
}
