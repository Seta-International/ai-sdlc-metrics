export class UpsertAiProviderConfigCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    /** Raw API key — only provided on create or rotate. Must never be stored in DB. */
    readonly rawApiKey: string,
    readonly providerType: 'openai',
    readonly defaultReasoningModel: string,
    readonly defaultClassificationModel: string,
    readonly embeddingModel: string,
    readonly callerTenantId: string,
    readonly callerRoles: readonly string[],
  ) {}
}
