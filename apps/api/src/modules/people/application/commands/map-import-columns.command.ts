export class MapImportColumnsCommand {
  constructor(
    readonly tenantId: string,
    readonly importJobId: string,
    readonly columnMapping: Record<string, string>, // CSV header → field_path
    readonly saveMappingProfile?: string | null,
  ) {}
}
