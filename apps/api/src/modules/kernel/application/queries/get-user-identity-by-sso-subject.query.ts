export class GetUserIdentityBySsoSubjectQuery {
  constructor(
    readonly ssoSubject: string,
    readonly tenantId: string,
  ) {}
}
