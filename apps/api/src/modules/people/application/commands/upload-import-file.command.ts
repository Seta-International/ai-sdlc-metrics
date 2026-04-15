export class UploadImportFileCommand {
  constructor(
    readonly tenantId: string,
    readonly fileDocumentId: string,
    readonly fileName: string,
    readonly rowCount: number,
    readonly requestedBy: string,
  ) {}
}
