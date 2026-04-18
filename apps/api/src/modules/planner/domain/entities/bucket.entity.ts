export class Bucket {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly planId: string,
    private _name: string,
    private _orderHint: string,
    readonly msBucketId: string | null,
    readonly msBucketEtag: string | null,
    readonly createdAt: Date,
    private _updatedAt: Date,
    readonly deletedAt: Date | null,
  ) {}

  get name(): string {
    return this._name
  }

  get orderHint(): string {
    return this._orderHint
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  static create(props: {
    id: string
    tenantId: string
    planId: string
    name: string
    orderHint: string
  }): Bucket {
    const now = new Date()
    return new Bucket(
      props.id,
      props.tenantId,
      props.planId,
      props.name,
      props.orderHint,
      null,
      null,
      now,
      now,
      null,
    )
  }

  static reconstitute(props: {
    id: string
    tenantId: string
    planId: string
    name: string
    orderHint: string
    msBucketId: string | null
    msBucketEtag: string | null
    createdAt: Date
    updatedAt: Date
    deletedAt: Date | null
  }): Bucket {
    return new Bucket(
      props.id,
      props.tenantId,
      props.planId,
      props.name,
      props.orderHint,
      props.msBucketId,
      props.msBucketEtag,
      props.createdAt,
      props.updatedAt,
      props.deletedAt,
    )
  }

  rename(newName: string): void {
    this._name = newName
    this._updatedAt = new Date()
  }

  reorder(newOrderHint: string): void {
    this._orderHint = newOrderHint
    this._updatedAt = new Date()
  }
}
