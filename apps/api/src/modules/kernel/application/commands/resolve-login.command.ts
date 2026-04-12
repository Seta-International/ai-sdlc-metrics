export class ResolveLoginCommand {
  constructor(
    public readonly provider: 'microsoft' | 'google' | 'magic_link',
    public readonly ssoSubject: string,
    public readonly email: string,
    public readonly displayName: string,
    public readonly tenantId: string,
  ) {}
}

export interface ResolveLoginResult {
  actorId: string
  tenantId: string
  roles: string[]
  provider: string
}
