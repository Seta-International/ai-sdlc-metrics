export class MsLinkedGroupEntity {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly msGroupId: string,
    readonly displayName: string,
    readonly linkedByActorId: string,
    readonly linkedAt: Date,
    private _syncEnabled: boolean,
    private _backfillingAt: Date | null,
    private _backfillJobId: string | null,
    private _unlinkedAt: Date | null,
  ) {}

  get syncEnabled(): boolean {
    return this._syncEnabled
  }

  get backfillingAt(): Date | null {
    return this._backfillingAt
  }

  get backfillJobId(): string | null {
    return this._backfillJobId
  }

  get unlinkedAt(): Date | null {
    return this._unlinkedAt
  }

  static create(props: {
    id: string
    tenantId: string
    msGroupId: string
    displayName: string
    linkedByActorId: string
    linkedAt?: Date
  }): MsLinkedGroupEntity {
    return new MsLinkedGroupEntity(
      props.id,
      props.tenantId,
      props.msGroupId,
      props.displayName,
      props.linkedByActorId,
      props.linkedAt ?? new Date(),
      true,
      null,
      null,
      null,
    )
  }

  static reconstitute(props: {
    id: string
    tenantId: string
    msGroupId: string
    displayName: string
    linkedByActorId: string
    linkedAt: Date
    syncEnabled: boolean
    backfillingAt: Date | null
    backfillJobId: string | null
    unlinkedAt: Date | null
  }): MsLinkedGroupEntity {
    return new MsLinkedGroupEntity(
      props.id,
      props.tenantId,
      props.msGroupId,
      props.displayName,
      props.linkedByActorId,
      props.linkedAt,
      props.syncEnabled,
      props.backfillingAt,
      props.backfillJobId,
      props.unlinkedAt,
    )
  }

  pauseSync(): void {
    this._syncEnabled = false
  }

  resumeSync(): void {
    this._syncEnabled = true
  }

  startBackfill(jobId: string): void {
    this._backfillingAt = new Date()
    this._backfillJobId = jobId
  }

  finishBackfill(): void {
    this._backfillingAt = null
    this._backfillJobId = null
  }

  unlink(): void {
    if (this._unlinkedAt !== null) return
    this._unlinkedAt = new Date()
  }
}
