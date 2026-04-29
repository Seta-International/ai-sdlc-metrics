export class RosterMemberEntity {
  constructor(
    readonly tenantId: string,
    readonly msRosterId: string,
    readonly actorId: string | null,
    readonly ssoSubject: string,
    readonly syncedAt: Date,
  ) {}

  static create(props: {
    tenantId: string
    msRosterId: string
    actorId?: string | null
    ssoSubject: string
  }): RosterMemberEntity {
    return new RosterMemberEntity(
      props.tenantId,
      props.msRosterId,
      props.actorId ?? null,
      props.ssoSubject,
      new Date(),
    )
  }
}
