export class GiveNoticeCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly lastWorkingDay: Date,
    readonly noticeType: 'resignation' | 'employer',
    readonly initiatedBy: string,
  ) {}
}
