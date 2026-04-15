export class EmployeeNoticeGivenEvent {
  static readonly eventName = 'people.employee-notice-given'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly lastWorkingDay: Date,
    public readonly noticeType: string,
  ) {}
}
