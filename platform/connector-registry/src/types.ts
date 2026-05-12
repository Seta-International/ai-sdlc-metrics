export type ConnectorDefinition = {
  id: string
  providerId: string
  displayName: string
  description: string
  customerFacingRationale: string
  requiredScopes: { delegated: string[]; application: string[] }
  capabilities: { syncable: boolean; writes: boolean }
}

export interface ConnectorRegistry {
  register(def: ConnectorDefinition): void
  get(id: string): ConnectorDefinition
  list(): ConnectorDefinition[]
  listByProvider(providerId: string): ConnectorDefinition[]
  scopeUnion(connectorIds: string[]): { delegated: string[]; application: string[] }
  /**
   * Throw `ConnectorNotConsented` if this tenant hasn't enabled the connector.
   * Implementation queries tenant.tenant_connectors; injected at composition root.
   */
  requireConsent(tenantId: string, connectorId: string): Promise<void>
}
