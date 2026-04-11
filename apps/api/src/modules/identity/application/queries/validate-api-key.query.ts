export class ValidateApiKeyQuery {
  constructor(
    readonly keyHash: string,
    readonly tenantId: string,
  ) {}
}
