export class RequestMagicLinkCommand {
  constructor(
    readonly tenantId: string,
    readonly email: string,
  ) {}
}
