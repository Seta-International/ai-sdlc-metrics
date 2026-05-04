export class StartOnboardingCaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly employmentId: string,
    public readonly templateId: string | null,
  ) {}
}
