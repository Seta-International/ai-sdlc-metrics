import type { NameDisplayOrder } from '../../domain/value-objects/name-display-order'

export class CreatePersonProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly familyName: string,
    readonly givenName: string,
    readonly middleName: string | null,
    readonly nameDisplayOrder: NameDisplayOrder,
    readonly createdBy: string,
    readonly dateOfBirth?: Date | null,
    readonly gender?: 'male' | 'female' | 'other' | 'undisclosed' | null,
    readonly nationality?: string | null,
    readonly preferredName?: string | null,
  ) {}
}
