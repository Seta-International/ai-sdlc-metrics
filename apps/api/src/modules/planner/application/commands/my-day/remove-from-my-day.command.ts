export class RemoveFromMyDayCommand {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly taskId: string,
    public readonly date: string,
  ) {}
}
