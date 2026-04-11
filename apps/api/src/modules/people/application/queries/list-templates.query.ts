export class ListTemplatesQuery {
  constructor(
    readonly tenantId: string,
    readonly templateType: 'onboarding' | 'offboarding',
  ) {}
}
