export class UpdateBrandingCommand {
  constructor(
    public readonly tenantId: string,
    public readonly companyName: string,
    public readonly logoFileKey: string | null,
    public readonly primaryColor: string | null,
    public readonly fontFamily: string | null,
  ) {}
}
