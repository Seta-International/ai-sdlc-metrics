export interface LinkedInImportItem {
  sectionType: string
  data: Record<string, unknown>
}

export class ConfirmLinkedInImportCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly selectedItems: LinkedInImportItem[],
    readonly createdBy: string,
  ) {}
}
