import type { IdentityProvider } from '../../domain/entities/user-identity.entity'

export class CreateUserIdentityCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly email: string,
    readonly ssoSubject: string,
    readonly provider: IdentityProvider,
  ) {}
}
