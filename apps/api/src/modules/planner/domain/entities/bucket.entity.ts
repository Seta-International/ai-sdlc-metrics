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
    readonly deletedAt: Date | null,
  ) {}

  get name(): string {
    return this._name
  }

  get orderHint(): string {
    return this._orderHint
  }

  static create(props: {
    id: string
    tenantId: string
    planId: string
    name: string
    orderHint: string
  }): Bucket {
    return new Bucket(
      props.id,
      props.tenantId,
      props.planId,
      props.name,
      props.orderHint,
      null,
      null,
      new Date(),
      null,
    )
  }

  rename(newName: string): void {
    this._name = newName
  }

  reorder(newOrderHint: string): void {
    this._orderHint = newOrderHint
  }
}
