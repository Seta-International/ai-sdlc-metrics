export class IdpGroupMemberEntity {
  private constructor(
    public readonly tenantId: string,
    public readonly externalGroupId: string,
    public readonly ssoSubject: string,
    public readonly syncedAt: Date,
  ) {}

  static create(props: {
    tenantId: string
    externalGroupId: string
    ssoSubject: string
    syncedAt?: Date
  }): IdpGroupMemberEntity {
    if (!props.tenantId) throw new Error('tenantId required')
    if (!props.externalGroupId) throw new Error('externalGroupId required')
    if (!props.ssoSubject) throw new Error('ssoSubject required')

    return new IdpGroupMemberEntity(
      props.tenantId,
      props.externalGroupId,
      props.ssoSubject,
      props.syncedAt ?? new Date(),
    )
  }
}
