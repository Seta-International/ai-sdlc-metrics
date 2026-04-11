export class OffboardingStartedEvent {
  static readonly eventName = 'people.offboarding-started'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly expectedLastDay: string | null,
  ) {}
}
