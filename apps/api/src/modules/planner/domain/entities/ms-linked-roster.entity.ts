export class MsLinkedRosterEntity {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly msRosterId: string,
    readonly displayName: string,
    readonly linkedByActorId: string,
    readonly linkedAt: Date,
    private _syncEnabled: boolean,
    private _mintedByFutureAt: Date | null,
    private _unlinkedAt: Date | null,
  ) {}

  get syncEnabled(): boolean {
    return this._syncEnabled
  }

  get mintedByFutureAt(): Date | null {
    return this._mintedByFutureAt
  }

  get unlinkedAt(): Date | null {
    return this._unlinkedAt
  }

  static create(props: {
    id: string
    tenantId: string
    msRosterId: string
    displayName: string
    linkedByActorId: string
    linkedAt?: Date
    mintedByFutureAt?: Date | null
  }): MsLinkedRosterEntity {
    return new MsLinkedRosterEntity(
      props.id,
      props.tenantId,
      props.msRosterId,
      props.displayName,
      props.linkedByActorId,
      props.linkedAt ?? new Date(),
      true,
      props.mintedByFutureAt ?? null,
      null,
    )
  }

  static reconstitute(props: {
    id: string
    tenantId: string
    msRosterId: string
    displayName: string
    linkedByActorId: string
    linkedAt: Date
    syncEnabled: boolean
    mintedByFutureAt: Date | null
    unlinkedAt: Date | null
  }): MsLinkedRosterEntity {
    return new MsLinkedRosterEntity(
      props.id,
      props.tenantId,
      props.msRosterId,
      props.displayName,
      props.linkedByActorId,
      props.linkedAt,
      props.syncEnabled,
      props.mintedByFutureAt,
      props.unlinkedAt,
    )
  }

  markMinted(date: Date): void {
    this._mintedByFutureAt = date
  }

  unlink(): void {
    if (this._unlinkedAt !== null) return
    this._unlinkedAt = new Date()
  }
}
