export class MsPlanSyncStateEntity {
  private constructor(
    readonly planId: string,
    readonly tenantId: string,
    readonly msPlanId: string,
    private _msPlanEtag: string | null,
    private _lastPolledAt: Date | null,
    private _lastSuccessfulPollAt: Date | null,
    private _consecutiveErrorCount: number,
    private _lastErrorCode: string | null,
    private _lastErrorMessage: string | null,
    private _pollPausedUntil: Date | null,
  ) {}

  get msPlanEtag(): string | null {
    return this._msPlanEtag
  }

  get lastPolledAt(): Date | null {
    return this._lastPolledAt
  }

  get lastSuccessfulPollAt(): Date | null {
    return this._lastSuccessfulPollAt
  }

  get consecutiveErrorCount(): number {
    return this._consecutiveErrorCount
  }

  get lastErrorCode(): string | null {
    return this._lastErrorCode
  }

  get lastErrorMessage(): string | null {
    return this._lastErrorMessage
  }

  get pollPausedUntil(): Date | null {
    return this._pollPausedUntil
  }

  static create(props: {
    planId: string
    tenantId: string
    msPlanId: string
  }): MsPlanSyncStateEntity {
    return new MsPlanSyncStateEntity(
      props.planId,
      props.tenantId,
      props.msPlanId,
      null,
      null,
      null,
      0,
      null,
      null,
      null,
    )
  }

  static reconstitute(props: {
    planId: string
    tenantId: string
    msPlanId: string
    msPlanEtag: string | null
    lastPolledAt: Date | null
    lastSuccessfulPollAt: Date | null
    consecutiveErrorCount: number
    lastErrorCode: string | null
    lastErrorMessage: string | null
    pollPausedUntil: Date | null
  }): MsPlanSyncStateEntity {
    return new MsPlanSyncStateEntity(
      props.planId,
      props.tenantId,
      props.msPlanId,
      props.msPlanEtag,
      props.lastPolledAt,
      props.lastSuccessfulPollAt,
      props.consecutiveErrorCount,
      props.lastErrorCode,
      props.lastErrorMessage,
      props.pollPausedUntil,
    )
  }

  recordSuccessfulPoll(etag: string): void {
    const now = new Date()
    this._msPlanEtag = etag
    this._lastPolledAt = now
    this._lastSuccessfulPollAt = now
    this._consecutiveErrorCount = 0
    this._lastErrorCode = null
    this._lastErrorMessage = null
  }

  recordError(code: string, message: string): void {
    this._lastPolledAt = new Date()
    this._consecutiveErrorCount += 1
    this._lastErrorCode = code
    this._lastErrorMessage = message
  }

  pauseUntil(date: Date): void {
    this._pollPausedUntil = date
  }
}
