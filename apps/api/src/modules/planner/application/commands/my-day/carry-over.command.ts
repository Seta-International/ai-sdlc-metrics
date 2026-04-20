export class CarryOverMyDayCommand {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly fromDate: string, // YYYY-MM-DD tenant-local
    public readonly toDate: string, // YYYY-MM-DD tenant-local
    public readonly taskIds: string[],
  ) {}
}
